import { Router } from 'express';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { DatabaseService, ContractVerification, ContractSource } from './database';
import { verifyContract } from '../utils/contract-verifier';
import config from '../config';

export function setupContractRoutes(database: DatabaseService): Router {
    const router = Router();

    // Contract verification endpoint
    router.post('/verify', async (req, res) => {
        try {
            const {
                address,
                name,
                source_code,
                compiler_version,
                optimization_used,
                optimization_runs,
                constructor_arguments,
                license_type,
                sources
            } = req.body;

            if (!ethers.utils.isAddress(address)) {
                res.status(400).json({ error: 'Invalid contract address' });
                return;
            }

            // Create verification record
            const verification: ContractVerification = {
                address,
                name,
                source_code,
                compiler_version,
                optimization_used,
                optimization_runs,
                constructor_arguments,
                abi: '', // Will be populated during verification
                verified_at: new Date(),
                is_verified: false,
                license_type,
                verification_status: 'pending'
            };

            await database.insertContractVerification(verification);

            // Handle multiple source files if provided
            if (sources && Array.isArray(sources)) {
                for (const source of sources) {
                    const contractSource: ContractSource = {
                        address,
                        filename: source.filename,
                        source_code: source.content,
                        compiler_version,
                        abi: '',
                        creation_bytecode: '',
                        deployed_bytecode: '',
                        is_primary: source.filename === 'main.sol'
                    };
                    await database.insertContractSource(contractSource);
                }
            }

            // Start verification process
            verifyContract(verification, database).catch((error: Error) => {
                logger.error('Contract verification failed:', error);
            });

            res.json({
                status: 'pending',
                message: 'Verification submitted successfully'
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Error submitting verification:', error);
            res.status(500).json({ error: 'Failed to submit verification', message: errorMessage });
        }
    });

    // Get verification status
    router.get('/:address/verification', async (req, res) => {
        try {
            const { address } = req.params;
            
            if (!ethers.utils.isAddress(address)) {
                res.status(400).json({ error: 'Invalid contract address' });
                return;
            }

            const verification = await database.getContractVerification(address);
            if (!verification) {
                res.status(404).json({ error: 'Contract verification not found' });
                return;
            }

            res.json(verification);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Error getting verification status:', error);
            res.status(500).json({ error: 'Failed to get verification status', message: errorMessage });
        }
    });

    // Get contract source code
    router.get('/:address/source', async (req, res) => {
        try {
            const { address } = req.params;
            
            if (!ethers.utils.isAddress(address)) {
                res.status(400).json({ error: 'Invalid contract address' });
                return;
            }

            const sources = await database.getContractSources(address);
            if (!sources || sources.length === 0) {
                res.status(404).json({ error: 'Contract source not found' });
                return;
            }

            res.json(sources);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Error getting contract source:', error);
            res.status(500).json({ error: 'Failed to get contract source', message: errorMessage });
        }
    });

    // Get full contract information
    router.get('/:address', async (req, res) => {
        try {
            const { address } = req.params;
            
            if (!ethers.utils.isAddress(address)) {
                res.status(400).json({ error: 'Invalid contract address' });
                return;
            }

            const provider = new ethers.providers.JsonRpcProvider(config.rpc.url);
            
            // Get all contract information in parallel
            const [code, verification, sources, interfaces, history] = await Promise.all([
                provider.getCode(address),
                database.getContractVerification(address),
                database.getContractSources(address),
                database.getContractInterfaces(address),
                database.getTransactionsByAddress(address, 1000, 0)
            ]);

            const isContract = code !== '0x';
            if (!isContract) {
                res.status(404).json({ error: 'Not a contract address' });
                return;
            }

            // Find creation transaction
            const creationTx = history.find(tx => 
                tx.to_address === null && 
                tx.from_address?.toLowerCase() === address.toLowerCase()
            );

            // Try to get contract name and other common interfaces if not verified
            let contractInfo = {
                name: verification?.name || null,
                symbol: null,
                decimals: null,
                totalSupply: null
            };

            if (!verification) {
                try {
                    const contract = new ethers.Contract(address, [
                        'function name() view returns (string)',
                        'function symbol() view returns (string)',
                        'function decimals() view returns (uint8)',
                        'function totalSupply() view returns (uint256)'
                    ], provider);

                    const [name, symbol, decimals, totalSupply] = await Promise.all([
                        contract.name().catch(() => null),
                        contract.symbol().catch(() => null),
                        contract.decimals().catch(() => null),
                        contract.totalSupply().catch(() => null)
                    ]);

                    contractInfo = {
                        name,
                        symbol,
                        decimals: decimals ? decimals.toString() : null,
                        totalSupply: totalSupply ? totalSupply.toString() : null
                    };
                } catch (error) {
                    logger.info('Contract does not implement standard token interfaces');
                }
            }

            res.json({
                address,
                type: 'contract',
                has_code: true,
                code,
                ...contractInfo,
                verification_status: verification?.verification_status || 'unverified',
                is_verified: verification?.is_verified || false,
                verified_at: verification?.verified_at || null,
                license_type: verification?.license_type || null,
                compiler_version: verification?.compiler_version || null,
                optimization_used: verification?.optimization_used || null,
                optimization_runs: verification?.optimization_runs || null,
                abi: verification?.abi || null,
                source_available: sources.length > 0,
                interfaces: interfaces,
                creation_transaction: creationTx?.hash || null,
                creator: creationTx?.from_address || null,
                created_at: creationTx?.created_at || null
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Error getting contract info:', error);
            res.status(500).json({ error: 'Failed to get contract info', message: errorMessage });
        }
    });

    return router;
}
