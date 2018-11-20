import { BtpErrorMessage } from './packet'

export enum BtpErrorCode {
  UnreachableError = 'T00', // Message can't be processed at this time
  NotAcceptedError = 'F00', // Generic error at remote
  Unauthorized = 'F01', // Connection has not been authorized, use a sub-protocol to auth
  DuplicateIdError = 'F02', // Same ID used for different messages
  UnknownProtocolError = 'F03', // Unrecognized sub-protocol
  UnknownCorrelationId = 'F04' // Got a response/error/ack with a correlation id that doesn't match any prev sent messages
}
export namespace BtpErrorCode {
  export function getName (code: BtpErrorCode): string {
    switch (code) {
      case BtpErrorCode.UnreachableError:
        return 'UnreachableError'
      case BtpErrorCode.NotAcceptedError:
        return 'NotAcceptedError'
      case BtpErrorCode.Unauthorized:
        return 'Unauthorized'
      case BtpErrorCode.DuplicateIdError:
        return 'DuplicateIdError'
      case BtpErrorCode.UnknownProtocolError:
        return 'UnknownProtocolError'
      case BtpErrorCode.UnknownCorrelationId:
        return 'UnknownCorrelationId'
    }
    throw new Error('Unknown BtpErrorCode')
  }
}

export class BtpError extends Error {
  constructor (code: BtpErrorCode, message?: string) {
    super(`${code}: ${message}`)
    Error.captureStackTrace(this, BtpError)
    this.name = BtpErrorCode.getName(code)
  }
}

export function btpErrorFromMessage (message: BtpErrorMessage): BtpError {
  return new BtpError(message.code, message.message)
}
export function btpErrorToString (error: BtpError) {
  return JSON.stringify({
    code: `${BtpErrorCode[error.name]} ${error.name}`,
    message: error.message,
    stack: error.stack || '-'
  })
}
