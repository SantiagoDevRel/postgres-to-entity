import type { CreationFlags } from '@arkiv-network/sdk';

export type DemoFlags = Required<CreationFlags>;
export const defaultFlags = (): DemoFlags => ({ readonly: false, permissionlessExtension: false });
