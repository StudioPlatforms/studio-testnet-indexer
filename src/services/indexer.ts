import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { BlockchainService } from './blockchain';
import { DatabaseService, Block, Transaction } from './database';

export class IndexerService {
    private blockchain: BlockchainService;
    private database: DatabaseService;
    private isIndexing: boolean;
    private lastProcessedBlock: number;

    constructor(blockchain: BlockchainService, database: DatabaseService) {
        this.blockchain = blockchain;
        this.database = database;
        this.isIndexing = false;
        this.lastProcessedBlock = 0;
    }

    async start(): Promise<void> {
        if (this.isIndexing) {
            logger.warn('Indexer is already running');
            return;
        }

        try {
            // Check connection to blockchain
            const isConnected = await this.blockchain.isConnected();
            if (!isConnected) {
                throw new Error('Not connected to blockchain');
            }

            // Get the last processed block from database
            const lastBlock = await this.database.getLatestBlock();
            this.lastProcessedBlock = lastBlock?.number || 0;

            // Start indexing
            this.isIndexing = true;
            logger.info(`Starting indexer from block ${this.lastProcessedBlock}`);

            // Subscribe to new blocks
            this.blockchain.subscribeToNewBlocks(this.handleNewBlock.bind(this));

            // Start processing historical blocks
            await this.processHistoricalBlocks();
        } catch (error) {
            logger.error('Failed to start indexer:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.isIndexing) {
            return;
        }

        this.isIndexing = false;
        this.blockchain.unsubscribeFromNewBlocks(this.handleNewBlock.bind(this));
        logger.info('Indexer stopped');
    }

    private async handleNewBlock(blockNumber: number): Promise<void> {
        if (!this.isIndexing) return;

        try {
            await this.processBlock(blockNumber);
        } catch (error) {
            logger.error(`Failed to process block ${blockNumber}:`, error);
        }
    }

    private async processHistoricalBlocks(): Promise<void> {
        while (this.isIndexing) {
            try {
                const latestBlockNumber = await this.blockchain.getLatestBlockNumber();
                const nextBlock = this.lastProcessedBlock + 1;

                if (nextBlock > latestBlockNumber) {
                    // Caught up with the chain
                    logger.info('Finished processing historical blocks');
                    break;
                }

                await this.processBlock(nextBlock);
            } catch (error) {
                logger.error('Error processing historical blocks:', error);
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    private async processBlock(blockNumber: number): Promise<void> {
        try {
            const blockWithTxs = await this.blockchain.getBlockWithTransactions(blockNumber);

            // Prepare block data
            const block: Block = {
                number: blockNumber,
                hash: blockWithTxs.hash,
                parent_hash: blockWithTxs.parentHash,
                timestamp: new Date(blockWithTxs.timestamp * 1000),
                transactions_count: blockWithTxs.transactions.length,
                gas_used: blockWithTxs.gasUsed.toString(),
                gas_limit: blockWithTxs.gasLimit.toString(),
                base_fee_per_gas: blockWithTxs.baseFeePerGas?.toString(),
            };

            // Insert block
            await this.database.insertBlock(block);

            // Process transactions
            for (const tx of blockWithTxs.transactions) {
                const receipt = await this.blockchain.getTransactionReceipt(tx.hash);
                if (!receipt) continue;

                const transaction: Transaction = {
                    hash: tx.hash,
                    block_number: blockNumber,
                    from_address: tx.from,
                    to_address: tx.to || undefined,
                    value: tx.value.toString(),
                    gas_price: tx.gasPrice?.toString() || '0',
                    gas_used: receipt.gasUsed.toString(),
                    input: tx.data,
                    status: receipt.status === 1,
                    transaction_index: receipt.transactionIndex,
                    nonce: tx.nonce,
                    created_at: new Date(blockWithTxs.timestamp * 1000).toISOString()
                };

                await this.database.insertTransaction(transaction);
            }

            this.lastProcessedBlock = blockNumber;
            logger.info(`Processed block ${blockNumber} with ${blockWithTxs.transactions.length} transactions`);
        } catch (error) {
            logger.error(`Failed to process block ${blockNumber}:`, error);
            throw error;
        }
    }

    getLastProcessedBlock(): number {
        return this.lastProcessedBlock;
    }

    isRunning(): boolean {
        return this.isIndexing;
    }
}
