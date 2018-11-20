import * as http from 'http'
import * as https from 'https'
import * as net from 'net'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import { GrpcTransport, BtpAuthResponse } from './stream'
import { SIGINT } from 'constants'
import { default as createLogger, Logger } from 'ilp-logger'
import { AccountInfo } from './account'
import {
  Server,
  ServerCredentials
} from 'grpc'
import { TransportService, DuplexStream } from './grpc'

export interface GrpcTransportServerOptions {
  secure?: boolean
}

export interface BtpServerServices {
  log: Logger,
  authenticate?: (req: http.IncomingMessage) => Promise<any>
}
export interface BtpServerListenOptions {
  host: string,
  port: number
}

export class GrpcTransportServer extends EventEmitter {
  protected _log: Logger
  protected _grpc: Server
  protected _authenticate: (req: http.IncomingMessage) => Promise<any>
  constructor (options: GrpcTransportServerOptions, services: BtpServerServices) {
    super()
    this._log = services.log
    this._authenticate = services.authenticate || skipAuthentication
  }
  public async listen (options: BtpServerListenOptions): Promise<void> {

    if (!options.host && !options.port) {
      throw new Error(`Both host and port must be provided`)
    }
    const log = this._log

    const verifyClient = (call: any, callback: any) => {
      this._authenticate(call.request).then((data) => {
        log.debug('Verify Client: Success')
        callback(null, data)
      }).catch((e) => {
        log.debug('Verify Client: Fail')
        callback(false, {})
      })
    }

    this._grpc = new Server()
    this._grpc.addService(TransportService.service, { MessageStream: this._handleNewStream.bind(this), Authenticate: verifyClient })
    this._grpc.bind(options.host + ':' + options.port, ServerCredentials.createInsecure())
    this._grpc.start()
    this.emit('listening')
  }

  _handleNewStream (stream: DuplexStream) {
    const accountId = String(stream.metadata.get('accountId')[0].toString())
    const log = createLogger('btp-server:' + accountId)
    const accountInfo = {
      relation: stream.metadata.get('accountRelation')[0],
      assetCode: stream.metadata.get('accountAssetCode')[0],
      assetScale: Number(stream.metadata.get('accountAssetScale')[0])
    } as AccountInfo
    this.emit('connection', new GrpcTransport(stream, { accountId, accountInfo },{ log }))
  }

}

async function skipAuthentication (req: any): Promise<BtpAuthResponse> {
  return req
}
