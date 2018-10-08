import * as WebSocket from 'ws'
import { BtpMessage, BtpErrorMessage, BtpMessagePacket, BtpResponsePacket, BtpErrorMessagePacket, BtpPacketType, deserializePacket, isBtpMessage, isBtpResponse, isBtpError, BtpAckPacket, isBtpAck, serializePacket, btpMessageToString, btpPacketToString, BtpMessageContentType } from './packet'
import UUID from './uuid'
import { SentMessage } from './sentMessage'
import { BtpError, BtpErrorCode } from './error'
import { ReceivedMessage, ReceivedMessageState } from './receivedMessage'
import { EventEmitter } from 'events'
import { AccountInfo, createLogger, IlpLogger, ModuleConstructorOptions, ModuleServices } from 'ilp-module-loader'

const log = createLogger('btp-socket')

export interface BtpAuthResponse {
  account?: string
  info?: AccountInfo
}

export interface BtpSocketOptions extends ModuleConstructorOptions {
  accountId?: string
  accountInfo?: AccountInfo
}

export interface BtpSocketServices extends ModuleServices {
}

export class BtpSocket extends EventEmitter {
  private _log: IlpLogger
  private _socket: WebSocket
  private _sentMessages: Map<string, SentMessage>
  private _receivedMessages: Map<string, ReceivedMessage>
  private _accountId?: string
  private _accountInfo?: AccountInfo
  constructor (webSocket: WebSocket, options: BtpSocketOptions, services: BtpSocketServices) {
    super()
    this._socket = webSocket
    this._sentMessages = new Map()
    this._receivedMessages = new Map()

    this._log = services.log
    this._accountId = options.accountId
    this._accountInfo = options.accountInfo

    this._socket.on('message', (data: Buffer) => {
      this._handleData(data)
    })

    this._socket.on('error', (code: number, reason: string) => {
      this.emit('error', new Error(`WSERROR ${code} ${reason}`))
    })

    this._socket.on('close', (code: number, reason: string) => {
      // TODO - Handle close
    })

    // TODO - Should we do more here?
    this._socket.on('ping', (data: Buffer) => {
      this._socket.pong(data)
    })

  }

  public get isAuthorized (): boolean {
    return Boolean(this._accountId)
  }

  public get accountId (): string | undefined {
    return this._accountId
  }

  public get accountInfo (): AccountInfo | undefined {
    return this._accountInfo
  }

  public async requestAuth (authInfo: {}): Promise<boolean> {
    const payload = Buffer.from(JSON.stringify(authInfo), 'utf8')
    const rsp = await this.request({
      protocol: 'auth',
      contentType: BtpMessageContentType.ApplicationJson,
      payload
    })
    const result = JSON.parse(rsp.payload.toString('utf8'))
    if (result.id) {
      this.authorize(result.id, result.info)
      return true
    } else {
      return false
    }
  }

  public authorize (accountId: string, accountInfo?: AccountInfo) {
    this._accountId = accountId
    this._accountInfo = accountInfo
  }

  public get state () {
    return this._socket.readyState
  }

  /**
   * Send a BTP Message and wait for the ACK
   *
   * @param message the message to send
   */
  public message (message: BtpMessage): Promise<void> {
    return new Promise<void>((ackCallback, errorCallback) => {
      const id = new UUID()
      const type = BtpPacketType.MESSAGE
      const packet = Object.assign({ id, type }, message)

      const sentMessage = new SentMessage({ packet })
        .on('ack', () => { ackCallback() })
        .on('response', (response: BtpResponsePacket) => {
          const error = new Error(`Expected an ack but got a response: ${btpMessageToString(response)}`)
          errorCallback(error)
        })
        .on('error', (error: Error) => {
          errorCallback(error)
        })
        .on('timeout', () => {
          this._send(packet, sentMessage.sent.bind(sentMessage))
        })
      this._sentMessages.set(packet.id.toString(), sentMessage)
      this._send(packet, sentMessage.sent.bind(sentMessage))
    })
  }

  /**
   * Send a BTP Request and wait for the response.
   *
   * An ACK callback can be provided which is called when an ACK is received
   * from the other side (or a response/error if no ACK was received prior).
   *
   * The ACK callback is always called before the returned promise resolves or rejects.
   *
   * @param message Message to send
   * @param ackCallback Optional ACK callback
   */
  public request (message: BtpMessage, ackCallback?: () => void): Promise<BtpMessage> {
    return new Promise<BtpMessage>((responseCallback, errorCallback) => {
      const id = new UUID()
      const type = BtpPacketType.REQUEST
      const packet = Object.assign({ id, type }, message)
      let acknowledged = false

      const sentRequest = new SentMessage({ packet })
        .on('ack', () => {
          acknowledged = true
          if (ackCallback) {
            ackCallback()
          }
        })
        .on('response', (response: BtpResponsePacket) => {
          if (!acknowledged && ackCallback) {
            ackCallback()
          }
          responseCallback(response)
        })
        .on('error', (error: BtpError) => {
          if (!acknowledged && ackCallback) {
            ackCallback()
          }
          errorCallback(error)
        })
        .on('timeout', () => {
          this._send(packet, sentRequest.sent.bind(sentRequest))
        })
      this._sentMessages.set(packet.id + '', sentRequest)
      this._send(packet, sentRequest.sent.bind(sentRequest))
    })
  }

  private _handleData (data: Buffer): void {
    const packet = deserializePacket(data)
    this._log.debug(`receive: ${btpPacketToString(packet)}`)
    if (isBtpMessage(packet)) {
      if (packet.type === BtpPacketType.MESSAGE) {
        this._handleMessage(packet)
      } else {
        this._handleRequest(packet)
      }
    } else if (isBtpResponse(packet)) {
      this._handleResponse(packet)
    } else if (isBtpError(packet)) {
      this._handleError(packet)
    } else if (isBtpAck(packet)) {
      this._handleAck(packet)
    } else {
      // Unknown Type

    }
  }

  private _handleMessage (packet: BtpMessagePacket): void {

    // Idempotency - just send ack for same message
    const prevReceivedMessage = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedMessage) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple time using same ID
      if (Number(prevReceivedMessage.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ACK
        } as BtpAckPacket,
        prevReceivedMessage.acknowledged.bind(prevReceivedMessage))
      } else if (Number(prevReceivedMessage.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        this._send(
          Object.assign(prevReceivedMessage.error, { id: new UUID() }),
          prevReceivedMessage.errorSent.bind(prevReceivedMessage))
      } else {
        // TODO We are getting the same repeated message but not responding.
        // Likely no listeners bound for the request event. Just ignore?
      }
    } else {
      const receivedMessage = new ReceivedMessage({ packet })
      this._receivedMessages.set(packet.id.toString(), receivedMessage)
      const ackPacket = {
        id: new UUID(),
        correlationId: packet.id,
        type: BtpPacketType.ACK
      } as BtpAckPacket
      this._send(
        ackPacket,
        receivedMessage.acknowledged.bind(receivedMessage))
      this.emit('message', packet, (error: BtpError) => {
        const errorPacket = {
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ERROR,
          code: BtpErrorCode.NotAcceptedError, // TODO Map BtpError to correct code
          message: error.message
        } as BtpErrorMessagePacket
        this._send(
          errorPacket,
          receivedMessage.errorSent.bind(receivedMessage, errorPacket))
      })
    }
  }
  private _handleRequest (packet: BtpMessagePacket): void {

    // Idempotency - just send ack or resend reply
    const prevReceivedRequest = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedRequest) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple time using same ID
      if (Number(prevReceivedRequest.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ACK
        } as BtpAckPacket,
        prevReceivedRequest.acknowledged.bind(prevReceivedRequest))
      } else if (Number(prevReceivedRequest.state) === Number(ReceivedMessageState.RESPONSE_SENT)) {
        const responsePacket = Object.assign(prevReceivedRequest.response, { id: new UUID() })
        this._send(
          responsePacket,
          prevReceivedRequest.responseSent.bind(prevReceivedRequest))
      } else if (Number(prevReceivedRequest.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        const errorPacket = Object.assign(prevReceivedRequest.error, { id: new UUID() })
        this._send(
          errorPacket,
          prevReceivedRequest.errorSent.bind(prevReceivedRequest))
      } else {
        // TODO We are getting the same repeated request but not responding.
        // Likely no listeners bound for the request event. Just ignore?
      }
    } else {
      const receivedRequest = new ReceivedMessage({ packet })
      this._receivedMessages.set(packet.id.toString(), receivedRequest)
      const ackPacket = {
        id: new UUID(),
        correlationId: packet.id,
        type: BtpPacketType.ACK
      } as BtpAckPacket
      this._send(
        ackPacket,
        receivedRequest.acknowledged.bind(receivedRequest))
      this.emit('request', packet, (reply: BtpMessage | BtpErrorMessage | Promise<BtpMessage | BtpErrorMessage>) => {
        if (reply instanceof Promise) {
          reply.then(asyncReply => {
            this._reply(receivedRequest, asyncReply)
          }).catch(error => {
            const errorPacket = Object.assign({
              id: new UUID(),
              correlationId: packet.id,
              type: BtpPacketType.ERROR,
              code: BtpErrorCode.NotAcceptedError
            }, error) as BtpErrorMessagePacket
            this._send(errorPacket, receivedRequest.errorSent.bind(receivedRequest, errorPacket))
          })
        } else {
          this._reply(receivedRequest, reply)
        }
      })
    }
  }
  private _reply (receivedRequest: ReceivedMessage, reply: BtpErrorMessage | BtpMessage) {
    if (reply instanceof BtpError) {
      const errorPacket = Object.assign({
        id: new UUID(),
        correlationId: receivedRequest.packet.id,
        type: BtpPacketType.ERROR
      }, reply) as BtpErrorMessagePacket
      this._send(errorPacket, receivedRequest.errorSent.bind(receivedRequest, errorPacket))
    } else {
      const responsePacket = Object.assign({
        id: new UUID(),
        correlationId: receivedRequest.packet.id,
        type: BtpPacketType.RESPONSE
      }, reply) as BtpResponsePacket
      this._send(responsePacket, receivedRequest.responseSent.bind(receivedRequest, responsePacket))
    }
  }

  private _handleResponse (packet: BtpResponsePacket): void {

    // Idempotency - just send ack for same response
    const prevReceivedResponse = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedResponse) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple times using same ID
      if (Number(prevReceivedResponse.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ACK
        } as BtpAckPacket,
        prevReceivedResponse.acknowledged.bind(prevReceivedResponse))
      } else if (Number(prevReceivedResponse.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        const errorPacket = Object.assign(prevReceivedResponse.error, { id: new UUID() })
        this._send(
          errorPacket,
          prevReceivedResponse.errorSent.bind(prevReceivedResponse, errorPacket))
      } else {
        // TODO We are getting the same repeated message but not responding.
        // Likely no listeners bound for the request event. Just ignore?
      }
    } else {
      const receivedResponse = new ReceivedMessage({ packet })
      this._receivedMessages.set(packet.id.toString(), receivedResponse)
      const originalRequest = this._sentMessages.get(packet.correlationId.toString())
      if (!originalRequest) {
        const errorPacket = {
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ERROR,
          code: BtpErrorCode.UnknownCorrelationId,
          message: `No request found with id: ${packet.correlationId.toString()}`
        } as BtpErrorMessagePacket
        this._send(
          errorPacket,
          receivedResponse.errorSent.bind(receivedResponse))
      } else {
        this._send({
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ACK
        } as BtpAckPacket,
        receivedResponse.acknowledged.bind(receivedResponse))
        originalRequest.responseReceived(packet)
      }
    }
  }

  private _handleError (packet: BtpErrorMessagePacket): void {

    // Idempotency - just send ack for same error
    const prevReceivedError = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedError) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple times using same ID
      if (Number(prevReceivedError.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ACK
        } as BtpAckPacket,
        prevReceivedError.acknowledged.bind(prevReceivedError))
      } else if (Number(prevReceivedError.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        const errorPacket = Object.assign(prevReceivedError.error, { id: new UUID() })
        this._send(
          errorPacket,
          prevReceivedError.errorSent.bind(prevReceivedError, errorPacket))
      } else {
        // TODO We are getting the same repeated message but not responding.
        // Likely no listeners bound for the request event. Just ignore?
      }
    } else {
      const receivedError = new ReceivedMessage({ packet })
      this._receivedMessages.set(packet.id.toString(), receivedError)
      const originalRequest = this._sentMessages.get(packet.correlationId.toString())
      if (!originalRequest) {
        const errorPacket = {
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ERROR,
          code: BtpErrorCode.UnknownCorrelationId,
          message: `No request found with id: ${packet.correlationId.toString()}`
        } as BtpErrorMessagePacket
        this._send(
          errorPacket,
          receivedError.errorSent.bind(receivedError))
      } else {
        this._send({
          id: new UUID(),
          correlationId: packet.id,
          type: BtpPacketType.ACK
        } as BtpAckPacket,
        receivedError.acknowledged.bind(receivedError))
        originalRequest.errorReceived(packet)
      }
    }
  }

  private _handleAck (packet: BtpAckPacket): void {
    const originalMessage = this._sentMessages.get(packet.correlationId.toString())
    if (!originalMessage) {
      // TODO Log an error for unsolicted ACK?
    } else {
      originalMessage.acknowledged()
    }
  }
  private _send (packet: BtpMessagePacket | BtpResponsePacket | BtpErrorMessagePacket | BtpAckPacket , cb: () => void) {
    this._log.debug(`send: ${btpPacketToString(packet)}`)
    this._socket.send(serializePacket(packet), (error?: Error) => {
      if (error) {
        throw error
      }
      if (cb) {
        cb()
      }
    })
  }
}

export async function createConnection (address: string, options: BtpSocketOptions & WebSocket.ClientOptions) {

  const optionsWithDefaults = Object.assign({
    setHost: false
  }, options)
  const socket = new WebSocket(address, ['btp3'], optionsWithDefaults)
  const btpSocket = new BtpSocket(socket, {}, {
    log: createLogger('btp-socket')
  })
  return new Promise<BtpSocket>((resolve, error) => {
    const timeout = setTimeout(() => {
      socket.close()
      error()
    }, 5000)
    socket.once('open', () => {
      clearTimeout(timeout)
      resolve(btpSocket)
    })
  })

}
