import {
  ClientDuplexStream,
  loadPackageDefinition,
  ServerDuplexStream,
  ChannelCredentials,
  ServiceError,
  Metadata,
  ServiceDefinition
} from 'grpc'

import { Frame } from './packet'

const PROTO_PATH = __dirname + '/../../src/lib/transport.proto'
const protoLoader = require('@grpc/proto-loader')
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
  {keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  })
const protoDescriptor = loadPackageDefinition(packageDefinition)
export const TransportService = protoDescriptor.transport.TransportService as TransportService

interface TransportService {
  new (address: string, credentials: ChannelCredentials): TransportServiceInstance
  service: ServiceDefinition<TransportServiceInstance>
}

export interface TransportServiceInstance {
  Authenticate: (message: AuthMessage, callback: (error: ServiceError | null, responseMessage: AuthResponse | null) => void) => void
  MessageStream: (meta: Metadata) => DuplexStream
}

export interface AuthMessage {
  id: string
}

export interface AuthResponse {
  id: string
}

export type DuplexStream = ClientDuplexStream< Frame, Frame> & ServerDuplexStream< Frame, Frame>
