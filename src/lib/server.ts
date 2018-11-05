import * as WebSocket from 'ws'
import * as http from 'http'
import * as https from 'https'
import * as net from 'net'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import { BtpStream, BtpAuthResponse } from './stream'
import { SIGINT } from 'constants'
import { ModuleConstructorOptions, ModuleServices, AccountInfo, createLogger, IlpLogger } from 'ilp-module-loader'

import {
    loadPackageDefinition,
    Server,
    ServerCredentials
} from 'grpc'

const PROTO_PATH = __dirname + '/../../src/lib/btp.proto'
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
export const interledger = protoDescriptor.interledger

export interface BtpServerOptions extends ModuleConstructorOptions {
  secure?: boolean
}

export interface BtpServerServices extends ModuleServices {
  authenticate?: (req: http.IncomingMessage) => Promise<any>
}
export interface BtpServerListenOptions {
  host: string,
  port: number
}

export class BtpServer extends EventEmitter {
  protected _log: IlpLogger
  protected _grpc: Server
  protected _authenticate: (req: http.IncomingMessage) => Promise<any>
  constructor (options: BtpServerOptions, services: BtpServerServices) {
    super()
    this._log = services.log
    this._authenticate = services.authenticate || skipAuthentication
  }
  public async listen (options: BtpServerListenOptions): Promise<void> {

    if (!options.host && !options.port) {
      throw new Error(`Both host and port must be provided`)
    }
    const log = this._log
    const authenticate = this._authenticate

    const handleProtocols = (protocols: string[], req: http.IncomingMessage): string | false => {
      log.debug('HandleProtocols: %s', protocols.join(','))
      if (protocols.indexOf('btp3') > -1) {
        return 'btp3'
      }
      return false
    }

    const verifyClient = (call: any, callback: any) => {
      console.log('verify Client')
      this._authenticate(call.request).then((data) => {
        log.debug('Verify Client: Success')
        setTimeout(() => {
          callback(null, data)
        }, 1000)
      }).catch((e) => {
        log.debug('Verify Client: Fail')
        callback(false, {})
      })
    }

    this._grpc = new Server()

    this._grpc.addService(interledger.Interledger.service, { Stream: this._handleNewStream.bind(this), Authenticate: verifyClient })
    this._grpc.bind(options.host + ':' + options.port, ServerCredentials.createInsecure())
    this._grpc.start()
    this.emit('listening')
  }

  _handleNewStream (call: any) {
    const accountId = call.metadata.get('accountId')[0]
    const log = createLogger('btp-server:' + accountId)
    const accountInfo = {
      relation: call.metadata.get('accountRelation')[0],
      assetCode: call.metadata.get('accountAssetCode')[0],
      assetScale: call.metadata.get('accountAssetScale')[0]
    } as AccountInfo
    const btpStream = new BtpStream(call, { accountId, accountInfo },{ log })
    this.emit('connection', btpStream)
  }

}

async function skipAuthentication (req: http.IncomingMessage): Promise<BtpAuthResponse> {
  return {}
}
