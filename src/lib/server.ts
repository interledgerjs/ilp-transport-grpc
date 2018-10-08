import * as WebSocket from 'ws'
import * as http from 'http'
import * as https from 'https'
import * as net from 'net'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import { BtpSocket, BtpAuthResponse } from './socket'
import { SIGINT } from 'constants'
import { ModuleConstructorOptions, ModuleServices, AccountInfo, createLogger, IlpLogger } from 'ilp-module-loader'

export interface BtpServerOptions extends ModuleConstructorOptions, https.ServerOptions {
  secure?: boolean
}

export interface BtpServerServices extends ModuleServices {
  authenticate?: (req: http.IncomingMessage) => Promise<BtpAuthResponse>
}
export interface BtpServerListenOptions extends net.ListenOptions {
}
interface ExtendedWebSocket extends WebSocket {
  accountId?: string
  accountInfo?: AccountInfo
}
export class BtpServer extends EventEmitter {
  protected _log: IlpLogger
  protected _server: http.Server | https.Server
  protected _wss: WebSocket.Server
  protected _authenticate: (req: http.IncomingMessage) => Promise<BtpAuthResponse>
  constructor (options: BtpServerOptions, services: BtpServerServices) {
    super()
    this._log = services.log
    this._server = options.secure ? https.createServer(options) : http.createServer()
    this._authenticate = services.authenticate || skipAuthentication
  }
  public async listen (options: BtpServerListenOptions): Promise<void> {

    if (!options.path && !options.port) {
      throw new Error(`Either a path or port must be provided`)
    }
    const log = this._log
    const unixSocket = options.path && !options.port
    const server = this._server
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

    this._wss = new WebSocket.Server({
      server,
      handleProtocols,
      verifyClient
    })

    // Handle UNIX sockets that weren't cleaned up properly
    this._wss.on('error', (e: any) => {
      if (e.code === 'EADDRINUSE' && unixSocket) {
        this._log.warn(`${options.path} in use, attempting to clean up.`)
        const tempClientSocket = new net.Socket()
        tempClientSocket.on('error', (ce: any) => {
          if (ce.code === 'ECONNREFUSED') {  // No other server listening
            this._log.warn(`No server listening at ${options.path}. Removing file and trying again.`)
            fs.unlinkSync(`${options.path}`)
            server.close()
            server.listen(`${options.path}`)
          }
        })
        tempClientSocket.connect({ path: options.path! }, () => {
          this._log.error(`Another server is listening on ${options.path}.`)
          this.emit('error', e)
        })
      } else {
        log.error(e)
        this.emit('error', e)
      }
    })

    // Override handleUpgrade to authenticate
    const wsHandleUpgrade = this._wss.handleUpgrade.bind(this._wss)
    this._wss.handleUpgrade = (req: http.IncomingMessage, socket: any, upgradeHead: Buffer, callback: (client: WebSocket) => void) => {
      authenticate(req).then(({ account, info }) => {
        // Use built-in logic from ws then attach custom properties to ws from auth
        wsHandleUpgrade(req, socket, upgradeHead, (authenticatedClient: ExtendedWebSocket) => {
          if (account) {
            authenticatedClient.accountId = account
            authenticatedClient.accountInfo = info
          }
          callback(authenticatedClient)
        })
      }).catch((e) => {
        throw e
      })
    }

    this._wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
      const accountId = (ws as ExtendedWebSocket).accountId
      const accountInfo = (ws as ExtendedWebSocket).accountInfo
      const log = createLogger('btp-server:' + accountId)
      const btpSocket = new BtpSocket(ws, { accountId, accountInfo }, { log })
      this.emit('connection', btpSocket)
    })

    server.listen(options, () => {
      if (unixSocket) {
        process.on('SIGINT', () => {
          try {
            fs.unlinkSync(`${options.path}`)
          } catch (e) {
            console.error(e)
          }
          process.exit(128 + SIGINT)
        })
      }
      this.emit('listening')
    })
  }

}

async function skipAuthentication (req: http.IncomingMessage): Promise<BtpAuthResponse> {
  return {}
}
