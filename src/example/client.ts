import { createConnection, BtpMessageContentType } from '../lib'

(async () => {
  const client = await createConnection('127.0.0.1:5505', {
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

  console.time('test')
  let array = []

  const resp = await client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  })

  // for (let i = 0; i < 100000; i++) {
  //   // @ts-ignore
  //   array.push(client.request({
  //     protocol: 'ilp',
  //     contentType: BtpMessageContentType.ApplicationOctetStream,
  //     payload: Buffer.from('Hello?')
  //   }))
  // }

  console.log(resp.payload)

  console.timeEnd('test')
})()
