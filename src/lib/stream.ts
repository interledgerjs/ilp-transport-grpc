import { SError } from 'verror'
import {
  MessagePayload,
  ErrorPayload,
  MessageFrame,
  ResponseFrame,
  ErrorFrame,
  FrameType,
  isMessageFrame,
  isResponseFrame,
  isErrorFrame,
  AckFrame,
  isAckFrame,
  messageFrameToString,
  frameToString,
  FrameContentType,
  Frame
} from './packet'
import UUID from './uuid'
import { SentMessage } from './sentMessage'
import { TransportError, TransportErrorCode } from './error'
import { ReceivedMessage, ReceivedMessageState } from './receivedMessage'
import { EventEmitter } from 'events'
import { default as createLogger, Logger } from 'ilp-logger'
import { credentials, Metadata, MetadataValue } from 'grpc'
import { AccountInfo } from './account'
import { DuplexStream, TransportService, AuthResponse } from './grpc'
const log = createLogger('grpc-transport')

export interface BtpAuthResponse {
  account?: string
  info?: AccountInfo
}

export interface GrpcTransportOptions {
  accountId: string
  accountInfo: AccountInfo
  gcIntervalMs?: number
  gcMessageExpiryMs?: number
}

export interface GrpcTransportServices {
  log: Logger
}

export class GrpcTransport extends EventEmitter {
  private _log: Logger
  public _stream: DuplexStream
  private _sentMessages: Map<string, SentMessage>
  private _receivedMessages: Map<string, ReceivedMessage>
  private _accountId: string
  private _accountInfo?: AccountInfo

  private _gcIntervalMs: number
  private _gcMessageExpiryMs: number

  constructor (stream: DuplexStream, options: GrpcTransportOptions, services: GrpcTransportServices) {
    super()
    this._stream = stream
    this._sentMessages = new Map()
    this._receivedMessages = new Map()

    this._log = services.log
    this._accountId = options.accountId
    this._accountInfo = options.accountInfo

    this._gcIntervalMs = options.gcIntervalMs || 1000 // Run GC every second
    this._gcMessageExpiryMs = options.gcMessageExpiryMs || 5 * 60 * 1000 // Clean up messages that have not changed for more than 5 minutes

    this._stream.on('data', (data: Frame) => {
      this._handleData(data)
    })

    this._stream.on('cancelled', () => {
      this.emit('cancelled')
    })

    this._stream.on('error', (error: any) => {
      this.emit('error', error)
    })

    // this._gcMessages()
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
      contentType: FrameContentType.ApplicationJson,
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
    return true // this._stream.status()
  }

  /**
   * Send a Message and wait for the ACK
   *
   * @param message the message to send
   */
  public message (message: MessagePayload): Promise<void> {
    return new Promise<void>((ackCallback, errorCallback) => {
      const id = new UUID()
      const type = FrameType.MESSAGE
      const packet = Object.assign({ id: id.toString(), type }, message)

      const sentMessage = new SentMessage({ packet })
        .on('ack', () => { ackCallback() })
        .on('response', (response: ResponseFrame) => {
          const error = new Error(`Expected an ack but got a response: ${messageFrameToString(response)}`)
          errorCallback(error)
        })
        .on('error', (error: Error) => {
          errorCallback(error)
        })
        .on('timeout', () => {
          this._send(packet, sentMessage.sent.bind(sentMessage))
        })
      this._sentMessages.set(packet.id, sentMessage)
      this._send(packet, sentMessage.sent.bind(sentMessage))
    })
  }

  /**
   * Send a Request and wait for the Response.
   *
   * An ACK callback can be provided which is called when an ACK is received
   * from the other side (or a response/error if no ACK was received prior).
   *
   * The ACK callback is always called before the returned promise resolves or rejects.
   *
   * @param message Message to send
   * @param ackCallback Optional ACK callback
   */
  public request (message: MessagePayload, ackCallback?: () => void): Promise<MessagePayload> {
    return new Promise<MessagePayload>((responseCallback, errorCallback) => {
      const id = new UUID()
      const type = FrameType.REQUEST
      const packet = Object.assign({ id: id.toString(), type }, message)
      let acknowledged = false

      const sentRequest = new SentMessage({ packet })
        .on('ack', () => {
          acknowledged = true
          if (ackCallback) {
            ackCallback()
          }
        })
        .on('response', (response: ResponseFrame) => {
          if (!acknowledged && ackCallback) {
            ackCallback()
          }
          responseCallback(response)
        })
        .on('error', (error: TransportError) => {
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

  private _handleData (packet: any): void {
    try {
      if (isMessageFrame(packet)) {
        if (packet.type === FrameType.MESSAGE) {
          this._handleMessage(packet)
        } else {
          this._handleRequest(packet)
        }
      } else if (isResponseFrame(packet)) {
        this._handleResponse(packet)
      } else if (isErrorFrame(packet)) {
        this._handleError(packet)
      } else if (isAckFrame(packet)) {
        this._handleAck(packet)
      }
    } catch (e) {
      log.trace('Handle Data Error', packet)
      this.emit('error', new SError(e, `Unable to deserialize frame: ${packet}`))
    }
  }

  private _handleMessage (packet: MessageFrame): void {

    // Idempotency - just send ack for same message
    const prevReceivedMessage = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedMessage) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple time using same ID
      if (Number(prevReceivedMessage.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ACK
        } as AckFrame,
        prevReceivedMessage.acknowledged.bind(prevReceivedMessage))
      } else if (Number(prevReceivedMessage.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        this._send(
          Object.assign(prevReceivedMessage.error, { id: new UUID().toString() }),
          prevReceivedMessage.errorSent.bind(prevReceivedMessage))
      } else {
        // TODO We are getting the same repeated message but not responding.
        // Likely no listeners bound for the request event. Just ignore?
      }
    } else {
      const receivedMessage = new ReceivedMessage({ packet })
      this._receivedMessages.set(packet.id.toString(), receivedMessage)
      const ackPacket = {
        id: new UUID().toString(),
        correlationId: packet.id,
        type: FrameType.ACK
      } as AckFrame
      this._send(
        ackPacket,
        receivedMessage.acknowledged.bind(receivedMessage))
      this.emit('message', packet, (error: TransportError) => {
        const errorPacket = {
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ERROR,
          code: TransportErrorCode.NotAcceptedError, // TODO Map TransportError to correct code
          message: error.message
        } as ErrorFrame
        this._send(
          errorPacket,
          receivedMessage.errorSent.bind(receivedMessage, errorPacket))
      })
    }
  }
  private _handleRequest (packet: MessageFrame): void {

    // Idempotency - just send ack or resend reply
    const prevReceivedRequest = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedRequest) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple time using same ID
      if (Number(prevReceivedRequest.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ACK
        } as AckFrame,
        prevReceivedRequest.acknowledged.bind(prevReceivedRequest))
      } else if (Number(prevReceivedRequest.state) === Number(ReceivedMessageState.RESPONSE_SENT)) {
        const responsePacket = Object.assign(prevReceivedRequest.response, { id: new UUID().toString() })
        this._send(
          responsePacket,
          prevReceivedRequest.responseSent.bind(prevReceivedRequest))
      } else if (Number(prevReceivedRequest.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        const errorPacket = Object.assign(prevReceivedRequest.error, { id: new UUID().toString() })
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
        id: new UUID().toString(),
        correlationId: packet.id,
        type: FrameType.ACK
      } as AckFrame
      this._send(
        ackPacket,
        receivedRequest.acknowledged.bind(receivedRequest))
      this.emit('request', packet, (reply: MessagePayload | ErrorPayload | Promise<MessagePayload | ErrorPayload>) => {
        if (reply instanceof Promise) {
          reply.then(asyncReply => {
            this._reply(receivedRequest, asyncReply)
          }).catch(error => {
            const errorPacket = Object.assign({
              id: new UUID().toString(),
              correlationId: packet.id,
              type: FrameType.ERROR,
              code: TransportErrorCode.NotAcceptedError
            }, error) as ErrorFrame
            this._send(errorPacket, receivedRequest.errorSent.bind(receivedRequest, errorPacket))
          })
        } else {
          this._reply(receivedRequest, reply)
        }
      })
    }
  }
  private _reply (receivedRequest: ReceivedMessage, reply: ErrorPayload | MessagePayload) {
    if (reply instanceof TransportError) {
      const errorPacket = Object.assign({
        id: new UUID().toString(),
        correlationId: receivedRequest.packet.id,
        type: FrameType.ERROR
      }, reply) as ErrorFrame
      this._send(errorPacket, receivedRequest.errorSent.bind(receivedRequest, errorPacket))
    } else {
      const responsePacket = Object.assign({
        id: new UUID().toString(),
        correlationId: receivedRequest.packet.id,
        type: FrameType.RESPONSE
      }, reply) as ResponseFrame
      this._send(responsePacket, receivedRequest.responseSent.bind(receivedRequest, responsePacket))
    }
  }

  private _handleResponse (packet: ResponseFrame): void {

    // Idempotency - just send ack for same response
    const prevReceivedResponse = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedResponse) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple times using same ID
      if (Number(prevReceivedResponse.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ACK
        } as AckFrame,
        prevReceivedResponse.acknowledged.bind(prevReceivedResponse))
      } else if (Number(prevReceivedResponse.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        const errorPacket = Object.assign(prevReceivedResponse.error, { id: new UUID().toString() })
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
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ERROR,
          code: TransportErrorCode.UnknownCorrelationId,
          message: `No request found with id: ${packet.correlationId.toString()}`
        } as ErrorFrame
        this._send(
          errorPacket,
          receivedResponse.errorSent.bind(receivedResponse))
      } else {
        this._send({
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ACK
        } as AckFrame,
        receivedResponse.acknowledged.bind(receivedResponse))
        originalRequest.responseReceived(packet)
      }
    }
  }

  private _handleError (packet: ErrorFrame): void {

    // Idempotency - just send ack for same error
    const prevReceivedError = this._receivedMessages.get(packet.id.toString())
    if (prevReceivedError) {
      // TODO If the messages are different return an error
      // TODO Deal with possible DoS attack where same message is received multiple times using same ID
      if (Number(prevReceivedError.state) === Number(ReceivedMessageState.ACK_SENT)) {
        this._send({
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ACK
        } as AckFrame,
        prevReceivedError.acknowledged.bind(prevReceivedError))
      } else if (Number(prevReceivedError.state) === Number(ReceivedMessageState.ERROR_SENT)) {
        const errorPacket = Object.assign(prevReceivedError.error, { id: new UUID().toString() })
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
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ERROR,
          code: TransportErrorCode.UnknownCorrelationId,
          message: `No request found with id: ${packet.correlationId.toString()}`
        } as ErrorFrame
        this._send(
          errorPacket,
          receivedError.errorSent.bind(receivedError))
      } else {
        this._send({
          id: new UUID().toString(),
          correlationId: packet.id,
          type: FrameType.ACK
        } as AckFrame,
        receivedError.acknowledged.bind(receivedError))
        originalRequest.errorReceived(packet)
      }
    }
  }

  private _handleAck (packet: AckFrame): void {
    const originalMessage = this._sentMessages.get(packet.correlationId.toString())
    if (!originalMessage) {
      // TODO Log an error for unsolicted ACK?
    } else {
      originalMessage.acknowledged()
    }
  }
  private _send (packet: MessageFrame | ResponseFrame | ErrorFrame | AckFrame , cb: () => void) {
    this._log.debug(`send: ${frameToString(packet)}`)
    this._stream.write(packet)
  }
  private _gcMessages () {
    this._sentMessages.forEach((message, messageId) => {
      if (Date.now() - message.lastModified > this._gcMessageExpiryMs) {
        this._sentMessages.delete(messageId)
      }
    })
    this._receivedMessages.forEach((message, messageId) => {
      if (Date.now() - message.lastModified > this._gcMessageExpiryMs) {
        this._receivedMessages.delete(messageId)
      }
    })
    setTimeout(this._gcMessages.bind(this), this._gcIntervalMs)
  }
}

export async function createConnection (address: string, options: GrpcTransportOptions): Promise<GrpcTransport> {

  const channel = new TransportService(address, credentials.createInsecure())
  const meta = new Metadata()
  const { accountId, accountInfo } = options
  meta.add('accountId', String(accountId) as MetadataValue || 'test')
  meta.add('accountRelation', String(accountInfo.relation) as MetadataValue)
  meta.add('accountAssetCode', String(accountInfo.assetCode) as MetadataValue)
  meta.add('accountAssetScale', String(accountInfo.assetScale) as MetadataValue)

  // TODO: Fix to be more consistent with async/await
  await new Promise<AuthResponse | null>((resolve, reject) => {
    channel.Authenticate({ id: accountId }, function (err, result) {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })

  return new GrpcTransport(channel.MessageStream(meta), { accountId, accountInfo }, { log })
}
