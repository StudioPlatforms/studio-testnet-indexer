import config, { getDatabaseUrl } from './config';
import { logger } from './utils/logger';
import { BlockchainService } from './services/blockchain';
import { DatabaseService } from './services/database';
import { IndexerService } from './services/indexer';
import { ApiService } from './services/api';

async function main() {
    try {
        logger.info('Starting Studio Blockchain Indexer');

        // Initialize services
        const blockchain = new BlockchainService(config.rpc.url);
        const database = new DatabaseService(getDatabaseUrl());
        const indexer = new IndexerService(blockchain, database);
        const api = new ApiService(database, indexer, config.api.port);

        // Check blockchain connection
        const isConnected = await blockchain.isConnected();
        if (!isConnected) {
            throw new Error('Failed to connect to blockchain');
        }
        logger.info('Connected to blockchain');

        // Start services
        await indexer.start();
        logger.info('Indexer service started');

        api.start();
        logger.info('API service started');

        // Handle shutdown
        const shutdown = async () => {
            logger.info('Shutting down...');
            await indexer.stop();
            await database.close();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Log startup success
        logger.info(`
Studio Blockchain Indexer is running
================================
RPC URL: ${config.rpc.url}
Chain ID: ${config.rpc.chainId}
API Port: ${config.api.port}
================================
        `);

    } catch (error) {
        logger.error('Failed to start indexer:', error);
        process.exit(1);
    }
}

// Start the application
main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
});
