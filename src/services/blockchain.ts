import { ethers } from 'ethers';
import { logger } from '../utils/logger';

export type BlockWithTransactions = ethers.providers.Block & {
    transactions: ethers.providers.TransactionResponse[];
};

export class BlockchainService {
    private provider: ethers.providers.JsonRpcProvider;
    private newBlockCallback?: (blockNumber: number) => void;

    constructor(rpcUrl: string) {
        this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    }

    async isConnected(): Promise<boolean> {
        try {
            await this.provider.getNetwork();
            return true;
        } catch (error) {
            logger.error('Failed to connect to blockchain:', error);
            return false;
        }
    }

    async getLatestBlockNumber(): Promise<number> {
        return await this.provider.getBlockNumber();
    }

    async getBlockWithTransactions(blockNumber: number): Promise<BlockWithTransactions> {
        const block = await this.provider.getBlockWithTransactions(blockNumber);
        return block as BlockWithTransactions;
    }

    async getTransactionReceipt(txHash: string): Promise<ethers.providers.TransactionReceipt> {
        return await this.provider.getTransactionReceipt(txHash);
    }

    subscribeToNewBlocks(callback: (blockNumber: number) => void): void {
        this.newBlockCallback = callback;
        this.provider.on('block', (blockNumber: number) => {
            logger.info(`New block received: ${blockNumber}`);
            callback(blockNumber);
        });
    }

    unsubscribeFromNewBlocks(callback: (blockNumber: number) => void): void {
        this.provider.off('block', callback);
        this.newBlockCallback = undefined;
    }
}
