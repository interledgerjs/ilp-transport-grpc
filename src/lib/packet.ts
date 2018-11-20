import { Reader, Writer } from 'oer-utils'
import UUID from './uuid'
import { BtpErrorCode, BtpError } from './error'

export interface BtpPacket {
  type: BtpPacketType
  id: string
}
export interface BtpReplyPacket extends BtpPacket {
  correlationId: string
}
export interface BtpMessage {
  protocol: string
  contentType: BtpMessageContentType
  payload: Buffer
}
export interface BtpErrorMessage {
  code: BtpErrorCode
  message: string
}
export type BtpMessagePacket = BtpPacket & BtpMessage
export type BtpResponsePacket = BtpReplyPacket & BtpMessage
export type BtpErrorMessagePacket = BtpReplyPacket & BtpErrorMessage
export type BtpAckPacket = BtpReplyPacket
export type BtpGenericPacket = BtpMessagePacket & BtpResponsePacket & BtpErrorMessagePacket & BtpAckPacket
export enum BtpPacketType {
    MESSAGE = 1,
    REQUEST = 2,
    RESPONSE = 3,
    ERROR = 4,
    ACK = 5
}
export enum BtpMessageContentType {
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

export function isBtpMessage (packet: BtpPacket): packet is BtpMessagePacket {
  return packet.type === BtpPacketType.MESSAGE || packet.type === BtpPacketType.REQUEST
}
export function isBtpResponse (packet: BtpPacket): packet is BtpResponsePacket {
  return packet.type === BtpPacketType.RESPONSE
}
export function isBtpError (packet: BtpPacket): packet is BtpErrorMessagePacket {
  return packet.type === BtpPacketType.ERROR
}
export function isBtpAck (packet: BtpPacket): packet is BtpAckPacket {
  return packet.type === BtpPacketType.ACK
}

export function btpMessageToString (message: BtpMessagePacket | BtpResponsePacket) {
  const correlationId = isBtpResponse(message) ? message.correlationId.toString() : undefined
  return JSON.stringify({
    id: message.id.toString() || undefined,
    type: message.type || undefined,
    correlationId,
    protocol: message.protocol,
    payload: parsePayload(message)
  })
}

export function btpErrorMessageToString (error: BtpErrorMessagePacket) {
  return JSON.stringify({
    id: error.id.toString() || undefined,
    type: error.type || undefined,
    code: `${error.code} ${BtpErrorCode.getName(error.code)}`,
    message: error.message
  })
}

export function btpAckToString (packet: BtpAckPacket) {
  return JSON.stringify({
    id: packet.id.toString(),
    correlationId: packet.correlationId.toString()
  })
}

export function btpPacketToString (packet: BtpPacket): string {
  if (isBtpMessage(packet)) {
    return btpMessageToString(packet)
  } else if (isBtpResponse(packet)) {
    return btpMessageToString(packet)
  } else if (isBtpError(packet)) {
    return btpErrorMessageToString(packet)
  } else if (isBtpAck(packet)) {
    return btpAckToString(packet)
  } else {
    throw new TypeError(`Unknown packet type: ${packet.type}`)
  }
}

function parsePayload (message: BtpMessage) {
  switch (message.contentType) {
    case BtpMessageContentType.TextPlain:
      return message.payload.toString('utf8')
    case BtpMessageContentType.ApplicationJson:
      return JSON.parse(message.payload.toString('utf8'))
    case BtpMessageContentType.ApplicationOctetStream:
      return message.payload.toString('hex')
  }
}
