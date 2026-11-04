/**
 * The only RPC URL this sample ever offers to a wallet: Rabdi's keyless public endpoint.
 * Access keys stay server-side (/api/rpc, /api/sample); they never go into a wallet, the bundle, a URL or a QR.
 */
export const RABDI_PUBLIC_RPC = 'https://rpc.rabdi.db-chain.testnet.arkiv.network';
export const RABDI_EXPLORER = 'https://rabdi.explorer.arkiv.network';

type WalletRequest = { request(args: { method: string; params?: unknown }): Promise<unknown> };

export function rabdiAddChainParams(chainId: number) {
  return {
    chainId: '0x' + chainId.toString(16),
    chainName: 'Rabdi',
    nativeCurrency: { name: 'GLM', symbol: 'GLM', decimals: 18 },
    rpcUrls: [RABDI_PUBLIC_RPC],
    blockExplorerUrls: [RABDI_EXPLORER],
  };
}

/** Asks the wallet to switch to Rabdi; if the wallet does not know the chain (4902), adds it with the keyless RPC. */
export async function switchToRabdi(wallet: WalletRequest, chainId: number): Promise<void> {
  const hexId = '0x' + chainId.toString(16);
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await wallet.request({ method: 'wallet_addEthereumChain', params: [rabdiAddChainParams(chainId)] });
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
  }
}
