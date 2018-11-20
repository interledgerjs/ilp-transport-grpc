import { TransportErrorCode, TransportError } from './error'

export interface FrameHeaders {
  type: FrameType
  id: string
}
export interface ReplyFrameHeaders extends FrameHeaders {
  correlationId: string
}
export interface MessagePayload {
  protocol: string
  contentType: FrameContentType
  payload: Buffer
}
export interface ErrorPayload {
  code: TransportErrorCode
  message: string
}
export type Frame = MessageFrame | ResponseFrame | ErrorFrame | AckFrame
export type MessageFrame = FrameHeaders & MessagePayload
export type ResponseFrame = ReplyFrameHeaders & MessagePayload
export type ErrorFrame = ReplyFrameHeaders & ErrorPayload
export type AckFrame = ReplyFrameHeaders
export enum FrameType {
    MESSAGE = 1,
    REQUEST = 2,
    RESPONSE = 3,
    ERROR = 4,
    ACK = 5
}
export enum FrameContentType {
    ApplicationOctetStream = 0,
    TextPlain = 1,
    ApplicationJson = 2
}

// export function deserializePacket (data: Buffer): BtpPacket {
//   const oerReader = Reader.from(data)
//   const type = oerReader.readUInt8BigNum().toNumber() as BtpPacketType
//   const id = new UUID(oerReader.readOctetString(16))
//   switch (type) {
//     case BtpPacketType.MESSAGE:
//     case BtpPacketType.REQUEST:
//       const protocol = oerReader.readVarOctetString().toString('ascii')
//       const contentType = oerReader.readUInt8BigNum().toNumber() as BtpMessageContentType
//       const payload = oerReader.readVarOctetString()
//       return {
//         type,
//         id,
//         protocol,
//         contentType,
//         payload
//       } as BtpMessagePacket
//     case BtpPacketType.ERROR:
//     case BtpPacketType.RESPONSE:
//     case BtpPacketType.ACK:
//       const correlationId = new UUID(oerReader.readOctetString(16))
//       switch (type) {
//         case BtpPacketType.RESPONSE:
//           const protocol = oerReader.readVarOctetString().toString('ascii')
//           const contentType = oerReader.readUInt8BigNum().toNumber() as BtpMessageContentType
//           const payload = oerReader.readVarOctetString()
//           return {
//             type,
//             id,
//             correlationId,
//             protocol,
//             contentType,
//             payload
//           } as BtpResponsePacket
//         case BtpPacketType.ERROR:
//           const code = oerReader.read(3).toString('ascii')
//           const message = oerReader.readVarOctetString().toString('ascii')
//           return {
//             type,
//             id,
//             correlationId,
//             code,
//             message
//           } as BtpErrorMessagePacket
//         case BtpPacketType.ACK:
//           return {
//             type,
//             id,
//             correlationId
//           } as BtpAckPacket
//         default:
//           throw new Error(`Invalid packet type: ${type}`)
//       }
//     default:
//       throw new Error(`Invalid packet type: ${type}`)
//   }
//
// }
// export function serializePacket (packet: BtpPacket): Buffer {
//   const oerWriter = new Writer()
//   oerWriter.writeUInt8(packet.type)
//   oerWriter.writeOctetString(packet.id.bytes, 16)
//   switch (packet.type) {
//     case BtpPacketType.MESSAGE:
//     case BtpPacketType.REQUEST:
//       const messagePacket = packet as BtpMessagePacket
//       oerWriter.writeVarOctetString(Buffer.from(messagePacket.protocol, 'ascii'))
//       oerWriter.writeUInt8(messagePacket.contentType)
//       oerWriter.writeVarOctetString(messagePacket.payload)
//       return oerWriter.getBuffer()
//     case BtpPacketType.ERROR:
//     case BtpPacketType.RESPONSE:
//     case BtpPacketType.ACK:
//       oerWriter.writeOctetString((packet as BtpReplyPacket).correlationId.bytes, 16)
//       switch (packet.type) {
//         case BtpPacketType.RESPONSE:
//           const messagePacket = packet as BtpMessagePacket
//           oerWriter.writeVarOctetString(Buffer.from(messagePacket.protocol, 'ascii'))
//           oerWriter.writeUInt8(messagePacket.contentType)
//           oerWriter.writeVarOctetString(messagePacket.payload)
//           break
//         case BtpPacketType.ERROR:
//           const errorPacket = packet as BtpErrorMessagePacket
//           oerWriter.writeOctetString(Buffer.from(errorPacket.code, 'ascii'), 3)
//           oerWriter.writeVarOctetString(Buffer.from(errorPacket.message, 'utf8'))
//           break
//         case BtpPacketType.ACK:
//           break
//         default:
//           throw new BtpError(BtpErrorCode.NotAcceptedError, `Invalid packet type: ${packet.type}`)
//       }
//       return oerWriter.getBuffer()
//     default:
//       throw new BtpError(BtpErrorCode.NotAcceptedError, `Invalid packet type: ${packet.type}`)
//   }
// }

export function isMessageFrame (packet: FrameHeaders): packet is MessageFrame {
  return packet.type === FrameType.MESSAGE || packet.type === FrameType.REQUEST
}
export function isResponseFrame (packet: FrameHeaders): packet is ResponseFrame {
  return packet.type === FrameType.RESPONSE
}
export function isErrorFrame (packet: FrameHeaders): packet is ErrorFrame {
  return packet.type === FrameType.ERROR
}
export function isAckFrame (packet: FrameHeaders): packet is AckFrame {
  return packet.type === FrameType.ACK
}

export function messageFrameToString (message: MessageFrame | ResponseFrame) {
  const correlationId = isResponseFrame(message) ? message.correlationId.toString() : undefined
  return JSON.stringify({
    id: message.id.toString() || undefined,
    type: message.type || undefined,
    correlationId,
    protocol: message.protocol,
    payload: parsePayload(message)
  })
}

export function errorFrameToString (error: ErrorFrame) {
  return JSON.stringify({
    id: error.id.toString() || undefined,
    type: error.type || undefined,
    code: `${error.code} ${TransportErrorCode.getName(error.code)}`,
    message: error.message
  })
}

export function ackFrameToString (packet: AckFrame) {
  return JSON.stringify({
    id: packet.id.toString(),
    correlationId: packet.correlationId.toString()
  })
}

export function frameToString (packet: FrameHeaders): string {
  if (isMessageFrame(packet)) {
    return messageFrameToString(packet)
  } else if (isResponseFrame(packet)) {
    return messageFrameToString(packet)
  } else if (isErrorFrame(packet)) {
    return errorFrameToString(packet)
  } else if (isAckFrame(packet)) {
    return ackFrameToString(packet)
  } else {
    throw new TypeError(`Unknown packet type: ${packet.type}`)
  }
}

function parsePayload (message: MessagePayload) {
  switch (message.contentType) {
    case FrameContentType.TextPlain:
      return message.payload.toString('utf8')
    case FrameContentType.ApplicationJson:
      return JSON.parse(message.payload.toString('utf8'))
    case FrameContentType.ApplicationOctetStream:
      return message.payload.toString('hex')
  }
}
