import { MessageFrame, ResponseFrame, ErrorFrame, FrameType } from './packet'
import { EventEmitter } from 'events'
import { transportErrorFromMessage } from './error'

export enum ReceivedMessageState {
  RECEIVED = 0,
  ACK_SENT = 1,
  RESPONSE_SENT = 2,
  ERROR_SENT = 3
}

export interface ReceivedMessageOptions {
  packet: MessageFrame | ErrorFrame
}

/**
 * Represents the state of a received message (either a message or response)
 */
export class ReceivedMessage extends EventEmitter {
  private _state: ReceivedMessageState
  private _timestamps: Map<ReceivedMessageState, number> = new Map()
  private _packet: MessageFrame | ErrorFrame
  private _response?: ResponseFrame
  private _error?: ErrorFrame

  constructor (options: ReceivedMessageOptions) {
    super()
    this._packet = options.packet
    this._state = ReceivedMessageState.RECEIVED
  }

  public get state (): ReceivedMessageState {
    return this._state
  }

  public get packet (): MessageFrame | ErrorFrame {
    return this._packet
  }

  public get response (): ResponseFrame | undefined {
    return this._response
  }

  public get error (): ErrorFrame | undefined {
    return this._error
  }

  public get lastModified (): number {
    return this._timestamps.get(this._state) || -1
  }

  public get isComplete (): boolean {
    return (this._packet.type === FrameType.REQUEST &&
      Number(this._state) >= ReceivedMessageState.RESPONSE_SENT) ||
    Number(this._state) >= ReceivedMessageState.ACK_SENT
  }

  public acknowledged (): void {
    this._setState(ReceivedMessageState.ACK_SENT)
    this.emit('ack')
  }

  public responseSent (response: ResponseFrame): void {
    this._setState(ReceivedMessageState.RESPONSE_SENT)
    this._response = response
    this.emit('response', response)
  }

  public errorSent (error: ErrorFrame): void {
    this._setState(ReceivedMessageState.ERROR_SENT)
    this._error = error
    this.emit('error', transportErrorFromMessage(error))
  }

  private _setState (state: ReceivedMessageState) {
    if (Number(this._state) >= state) {
      // TODO - Throw state error?
    }
    this._state = state
    this._timestamps.set(state, Date.now())
  }

}
