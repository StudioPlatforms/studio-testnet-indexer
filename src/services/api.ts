import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { DatabaseService } from './database';
import { IndexerService } from './indexer';
import { setupContractRoutes } from './contract-routes';
import config from '../config';

const axios = require('axios');

export class ApiService {
    private app: express.Application;
    private database: DatabaseService;
    private indexer: IndexerService;
    private port: number;

    constructor(database: DatabaseService, indexer: IndexerService, port: number) {
        this.database = database;
        this.indexer = indexer;
        this.port = port;
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
            credentials: false,
            maxAge: 86400,
            preflightContinue: false,
            optionsSuccessStatus: 204,
        }));
        
        this.app.use(express.json({ limit: '50mb' }));
        
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, { service: 'indexer', timestamp: new Date().toISOString() });
            next();
        });

        this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            logger.error('API Error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    private setupRoutes(): void {
        // Health check endpoint
        this.app.get(['/health', '/api/health', '/v1/health'], (req, res) => {
            res.json({
                status: 'ok',
                lastBlock: this.indexer.getLastProcessedBlock(),
                isIndexing: this.indexer.isRunning()
            });
        });

        // Get last finalized block
        this.app.get(['/last-block', '/api/last-block'], async (req, res) => {
            try {
                const block = await this.database.getLatestBlock();
                if (!block) {
                    res.status(404).json({ error: 'No blocks found' });
                    return;
                }
                res.json(block);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Error getting last block:', error);
                res.status(500).json({ error: 'Failed to get last block', message: errorMessage });
            }
        });

        // Get total transactions count
        this.app.get(['/transactions/count', '/api/transactions/count', '/v1/transactions/count'], async (req, res) => {
            try {
                const count = await this.database.getTotalTransactions();
                res.json({ count });
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Error getting total transactions:', error);
                res.status(500).json({ error: 'Failed to get total transactions', message: errorMessage });
            }
        });

        // Get latest blocks with pagination
        this.app.get(['/blocks', '/api/blocks', '/v1/blocks'], async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 10;
                const offset = parseInt(req.query.offset as string) || 0;
                
                const latestBlock = await this.database.getLatestBlock();
                if (!latestBlock) {
                    res.json({ results: [], total_count: 0 });
                    return;
                }

                const blocks = [];
                for (let i = 0; i < limit && (latestBlock.number - i - offset) >= 0; i++) {
                    const blockNumber = latestBlock.number - i - offset;
                    const block = await this.database.getBlock(blockNumber);
                    if (block) {
                        const transactions = await this.database.getTransactionsByBlock(blockNumber);
                        blocks.push({
                            ...block,
                            transactions
                        });
                    }
                }
                
                res.json({
                    results: blocks,
                    total_count: latestBlock.number + 1
                });
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Error getting blocks:', error);
                res.status(500).json({ error: 'Failed to get blocks', message: errorMessage });
            }
        });

        // Get block by number with transactions
        this.app.get(['/blocks/:number', '/api/blocks/:number'], async (req, res) => {
            try {
                const blockNumber = parseInt(req.params.number);
                const block = await this.database.getBlock(blockNumber);
                if (!block) {
                    res.status(404).json({ error: 'Block not found' });
                    return;
                }
                
                const transactions = await this.database.getTransactionsByBlock(blockNumber);
                res.json({
                    ...block,
                    transactions
                });
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Error getting block:', error);
                res.status(500).json({ error: 'Failed to get block', message: errorMessage });
            }
        });

        // Get latest transactions with pagination
        this.app.get(['/transactions/latest', '/api/transactions/latest', '/v1/transactions'], async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 10;
                const offset = parseInt(req.query.offset as string) || 0;
                const includePagination = req.query.includePagination === 'true';
                const key = parseInt(req.query.key as string) || 0;

                const transactions = await this.database.getLatestTransactions(limit, offset);
                const totalCount = await this.database.getTotalTransactions();

                if (includePagination) {
                    res.json({
                        results: transactions,
                        total_count: totalCount,
                        next: key > 0 ? key - limit : totalCount - limit,
                        previous: key < totalCount ? key + limit : null
                    });
                } else {
                    res.json(transactions);
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Error getting latest transactions:', error);
                res.status(500).json({ error: 'Failed to get latest transactions', message: errorMessage });
            }
        });

        // Get transaction by hash
        this.app.get(['/transactions/:hash', '/api/transactions/:hash', '/v1/transactions/:hash'], async (req, res) => {
            try {
                const { hash } = req.params;
                logger.info(`Getting transaction details for hash: ${hash}`);

                const transaction = await this.database.getTransaction(hash);
                if (!transaction) {
                    res.status(404).json({ error: 'Transaction not found' });
                    return;
                }

                const provider = new ethers.providers.JsonRpcProvider(config.rpc.url);
                const receipt = await provider.getTransactionReceipt(hash);

                const response = {
                    ...transaction,
                    receipt: receipt ? {
                        status: receipt.status,
                        gas_used: receipt.gasUsed.toString(),
                        cumulative_gas_used: receipt.cumulativeGasUsed.toString(),
                        logs: receipt.logs.map(log => ({
                            address: log.address,
                            topics: log.topics,
                            data: log.data,
                            log_index: log.logIndex,
                            block_number: log.blockNumber,
                            transaction_index: log.transactionIndex
                        })),
                        contract_address: receipt.contractAddress,
                        block_hash: receipt.blockHash,
                        block_number: receipt.blockNumber,
                        transaction_index: receipt.transactionIndex
                    } : null
                };

                res.json(response);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Error getting transaction:', error);
                res.status(500).json({ error: 'Failed to get transaction', message: errorMessage });
            }
        });

        // Get transactions by address with pagination
        this.app.get(['/address/:address/transactions', '/api/address/:address/transactions', '/v1/address/:address/transactions'], async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 10;
                const offset = parseInt(req.query.offset as string) || 0;
                const includePagination = req.query.includePagination === 'true';

                const transactions = await this.database.getTransactionsByAddress(
                    req.params.address,
                    limit,
                    offset
                );

                if (includePagination) {
                    const totalCount = await this.database.getTotalTransactions();
                    res.json({
                        results: transactions,
                        total_count: totalCount
                    });
                } else {
                    res.json(transactions);
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Error getting address transactions:', error);
                res.status(500).json({ error: 'Failed to get transactions', message: errorMessage });
            }
        });

        // RPC proxy endpoint
        this.app.post(['/proxy/rpc', '/api/proxy/rpc'], async (req, res) => {
            try {
                const response = await axios.post(config.rpc.url, req.body, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
                res.header('Access-Control-Allow-Origin', '*');
                res.json(response.data);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('RPC proxy error:', error);
                res.status(500).json({ error: 'RPC request failed', message: errorMessage });
            }
        });

        // Mount contract routes
        this.app.use('/v2/contract', setupContractRoutes(this.database));
    }

    start(): void {
        this.app.listen(this.port, () => {
            logger.info(`API server listening on port ${this.port}`);
        });
    }
}
