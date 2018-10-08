import { BtpMessagePacket, BtpResponsePacket, BtpErrorMessagePacket, BtpPacketType } from './packet'
import { EventEmitter } from 'events'
import { BtpError, btpErrorFromMessage, BtpErrorCode } from './error'

export enum SentMessageState {
  CREATED = 0,
  SENT = 1,
  ACK_RECEIVED = 2,
  RESPONSE_RECEIVED = 3,
  ERROR_RECEIVED = 4,
  TIMED_OUT = 5
}

export interface SentMessageOptions {
  packet: BtpMessagePacket
  retries?: number
  ackTimeout?: number
  responseTimeout?: number
}

/**
 * Represents the state of a sent message (either a message, request or response)
 */
export class SentMessage extends EventEmitter {
  private _ackTimeout?: NodeJS.Timer
  private _responseTimeout?: NodeJS.Timer
  private _retriesRemaining: number
  private _ackTimeoutMs: number
  private _responseTimeoutMs: number
  private _state: SentMessageState
  private _timestamps: Map<SentMessageState, number> = new Map()
  packet: BtpMessagePacket

  constructor (options: SentMessageOptions) {
    super()
    this.packet = options.packet
    this._state = SentMessageState.CREATED

    this._retriesRemaining = options.retries || Infinity
    this._responseTimeoutMs = options.responseTimeout || 30 * 1000
    this._ackTimeoutMs = (options.ackTimeout && (options.ackTimeout < this._responseTimeoutMs))
      ? options.ackTimeout
      : this._responseTimeoutMs
  }

  public get state (): SentMessageState {
    return this._state
  }

  public get lastModified (): number {
    return this._timestamps.get(this._state) || -1
  }

  public get isComplete (): boolean {
    return (this.packet.type === BtpPacketType.REQUEST &&
      Number(this._state) >= SentMessageState.RESPONSE_RECEIVED) ||
    Number(this._state) >= SentMessageState.ACK_RECEIVED
  }

  public sent (): void {
    this._setState(SentMessageState.SENT)
    this._startTimers()
  }
  public acknowledged (): void {
    this._setState(SentMessageState.ACK_RECEIVED)
    if (this._ackTimeout) {
      clearTimeout(this._ackTimeout)
    }
    this.emit('ack')
  }

  public responseReceived (response: BtpResponsePacket): void {
    this._setState(SentMessageState.RESPONSE_RECEIVED)
    this._stopTimers()
    this.emit('response', response)
  }

  public errorReceived (error: BtpErrorMessagePacket): void {
    this._setState(SentMessageState.ERROR_RECEIVED)
    this._stopTimers()
    this.emit('error', btpErrorFromMessage(error))
  }

  public timedOut (): void {
    this._setState(SentMessageState.TIMED_OUT)
    this._stopTimers()
    const message = (this.packet.type === BtpPacketType.REQUEST)
     ? 'response'
     : 'ACK'
    const error = new Error(`Timed out waiting for ${message}: ${this.packet.id.toString()}`)
    this.emit('error', error)
  }

  private _setState (state: SentMessageState) {
    if (Number(this._state) >= state) {
      // TODO - Throw state error?
    }
    this._state = state
    this._timestamps.set(state, Date.now())
  }

  private _startTimers () {
    if (this._ackTimeoutMs < this._responseTimeoutMs) {
      this._ackTimeout = setTimeout(() => {
        if (this._retriesRemaining > 0) {
          this._retriesRemaining--
          this.emit('timeout')
          this._startTimers()
        } else {
          if (this.packet.type !== BtpPacketType.REQUEST) {
            this.timedOut()
          }
        }
      }, this._ackTimeoutMs)
    }
    if (this.packet.type === BtpPacketType.REQUEST && !this._responseTimeout) {
      this._responseTimeout = setTimeout(() => {
        this.timedOut()
      }, this._responseTimeoutMs)
    }
  }

  private _stopTimers () {
    if (this._ackTimeout) {
      clearTimeout(this._ackTimeout)
    }
    if (this._responseTimeout) {
      clearTimeout(this._responseTimeout)
    }
  }
}
