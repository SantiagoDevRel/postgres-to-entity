import {verifyRabdi} from './verify-rabdi.mjs';

// Legacy entry point, now exercising the shared SDK 1.0 journey and geometry contract.
export async function verifyRowPreview(browser, output, origin='http://127.0.0.1:3083', options) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  try {return await verifyRabdi(page,output,origin,options);} finally {await context.close();}
}
