import { defineChain } from 'viem';

// Browser reads use this application's bounded, read-only proxy. Wallet writes go
// through the user's wallet; if it lacks Rabdi, rabdi-switch.ts adds the keyless public RPC.
export const rabdiBrowser = defineChain({
  id: 7794095,
  name: 'Rabdi',
  nativeCurrency: { name: 'GLM', symbol: 'GLM', decimals: 18 },
  rpcUrls: { default: { http: ['/api/rpc'] } },
  blockExplorers: { default: { name: 'Rabdi Explorer', url: 'https://rabdi.explorer.arkiv.network' } },
  testnet: true,
});
