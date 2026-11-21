export async function handler(event, context) {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from BADSEED Agent on Cloudflare Workers!" })
  }
}
