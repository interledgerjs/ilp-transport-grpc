import { createConnection, BtpMessageContentType } from '../lib'

(async () => {
  const client = await createConnection('127.0.0.1:5001', {
    headers: {
      authorization: 'Bearer TOKEN'
    },
    accountId: 'matt',
    accountInfo: {
      relation: 'parent',
      assetScale: 9,
      assetCode: 'xrp'
    }
  })

  client.on('error', (data: any) =>  {
    console.log(data)
  })

  client.on('request', (data: any) =>  {
    console.log(data)
  })

  const resp = await client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  })

  console.log(resp.payload)
})()
