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

const PROTO_PATH = __dirname + '/btp.proto'
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
  authenticate?: (req: http.IncomingMessage) => Promise<BtpAuthResponse>
}
export interface BtpServerListenOptions {
  host: string,
  port: number
}
interface ExtendedWebSocket extends WebSocket {
  accountId?: string
  accountInfo?: AccountInfo
}
export class BtpServer extends EventEmitter {
  protected _address: string
  protected _log: IlpLogger
  protected _grpc: Server
  protected _authenticate: (req: http.IncomingMessage) => Promise<BtpAuthResponse>
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
    const verifyClient = (info: { origin: string; secure: boolean; req: http.IncomingMessage }, callback: (res: boolean, code?: number, message?: string, headers?: http.OutgoingHttpHeaders) => void): void => {
      this._authenticate(info.req).then(() => {
        log.debug('Verify Client: Success')
        callback(true)
      }).catch((e) => {
        log.debug('Verify Client: Fail')
        callback(false, 401, 'Unauthorized')
      })
    }

    this._grpc = new Server()

    // Handle UNIX sockets that weren't cleaned up properly
    // this._wss.on('error', (e: any) => {
    //   if (e.code === 'EADDRINUSE' && unixSocket) {
    //     this._log.warn(`${options.path} in use, attempting to clean up.`)
    //     const tempClientSocket = new net.Socket()
    //     tempClientSocket.on('error', (ce: any) => {
    //       if (ce.code === 'ECONNREFUSED') {  // No other server listening
    //         this._log.warn(`No server listening at ${options.path}. Removing file and trying again.`)
    //         fs.unlinkSync(`${options.path}`)
    //         server.close()
    //         server.listen(`${options.path}`)
    //       }
    //     })
    //     tempClientSocket.connect({ path: options.path! }, () => {
    //       this._log.error(`Another server is listening on ${options.path}.`)
    //       this.emit('error', e)
    //     })
    //   } else {
    //     log.error(e)
    //     this.emit('error', e)
    //   }
    // })

    // Override handleUpgrade to authenticate
    // const wsHandleUpgrade = this._wss.handleUpgrade.bind(this._wss)
    // this._wss.handleUpgrade = (req: http.IncomingMessage, socket: any, upgradeHead: Buffer, callback: (client: WebSocket) => void) => {
    //   authenticate(req).then(({ account, info }) => {
    //     // Use built-in logic from ws then attach custom properties to ws from auth
    //     wsHandleUpgrade(req, socket, upgradeHead, (authenticatedClient: ExtendedWebSocket) => {
    //       if (account) {
    //         authenticatedClient.accountId = account
    //         authenticatedClient.accountInfo = info
    //       }
    //       callback(authenticatedClient)
    //     })
    //   }).catch((e) => {
    //     throw e
    //   })
    // }

    this._grpc.addService(interledger.Interledger.service, { Stream: this._handleNewStream.bind(this) })
    this._grpc.bind(options.host + ':' + options.port, ServerCredentials.createInsecure())
    this._grpc.start()
    this.emit('listening')
  }

  _handleNewStream (call: any) {
    const accountId = call.metadata.get('accountId')[0]
    const log = createLogger('btp-server:' + accountId)
    const accountInfo = { } as AccountInfo
    const btpStream = new BtpStream(call, { accountId, accountInfo },{ log })
    this.emit('connection', btpStream)
  }

}

async function skipAuthentication (req: http.IncomingMessage): Promise<BtpAuthResponse> {
  return {}
}
