import { ErrorPayload } from './packet'

export enum TransportErrorCode {
  UnreachableError = 'T00', // Message can't be processed at this time
  NotAcceptedError = 'F00', // Generic error at remote
  Unauthorized = 'F01', // Connection has not been authorized, use a sub-protocol to auth
  DuplicateIdError = 'F02', // Same ID used for different messages
  UnknownProtocolError = 'F03', // Unrecognized sub-protocol
  UnknownCorrelationId = 'F04' // Got a response/error/ack with a correlation id that doesn't match any prev sent messages
}
export namespace TransportErrorCode {
  export function getName (code: TransportErrorCode): string {
    switch (code) {
      case TransportErrorCode.UnreachableError:
        return 'UnreachableError'
      case TransportErrorCode.NotAcceptedError:
        return 'NotAcceptedError'
      case TransportErrorCode.Unauthorized:
        return 'Unauthorized'
      case TransportErrorCode.DuplicateIdError:
        return 'DuplicateIdError'
      case TransportErrorCode.UnknownProtocolError:
        return 'UnknownProtocolError'
      case TransportErrorCode.UnknownCorrelationId:
        return 'UnknownCorrelationId'
    }
    throw new Error('Unknown Error Code')
  }
}

export class TransportError extends Error {
  constructor (code: TransportErrorCode, message?: string) {
    super(`${code}: ${message}`)
    Error.captureStackTrace(this, TransportError)
    this.name = TransportErrorCode.getName(code)
  }
}

export function transportErrorFromMessage (message: ErrorPayload): TransportError {
  return new TransportError(message.code, message.message)
}
export function transportErrorToString (error: TransportError) {
  return JSON.stringify({
    code: `${TransportErrorCode[error.name]} ${error.name}`,
    message: error.message,
    stack: error.stack || '-'
  })
}
