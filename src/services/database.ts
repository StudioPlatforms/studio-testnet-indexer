import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface Block {
    number: number;
    hash: string;
    parent_hash: string;
    timestamp: Date;
    transactions_count: number;
    gas_used: string;
    gas_limit: string;
    base_fee_per_gas?: string;
}

export interface Transaction {
    hash: string;
    block_number: number;
    from_address: string;
    to_address?: string;
    value: string;
    gas_price: string;
    gas_used: string;
    input: string;
    status: boolean;
    transaction_index: number;
    nonce: number;
    created_at: string;
}

export interface ContractVerification {
    address: string;
    name: string;
    source_code: string;
    compiler_version: string;
    optimization_used: boolean;
    optimization_runs: number;
    constructor_arguments: string;
    abi: string;
    verified_at: Date;
    is_verified: boolean;
    license_type: string;
    verification_status: 'pending' | 'success' | 'failure';
    verification_error?: string;
}

export interface ContractInterface {
    address: string;
    interface_type: string;
    detected_at: Date;
}

export interface ContractSource {
    address: string;
    filename: string;
    source_code: string;
    compiler_version: string;
    abi: string;
    creation_bytecode: string;
    deployed_bytecode: string;
    is_primary: boolean;
}

export class DatabaseService {
    private pool: Pool;

    constructor(connectionString: string) {
        this.pool = new Pool({
            connectionString,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
    }

    // Existing block methods
    async getLatestBlock(): Promise<Block | null> {
        try {
            const result = await this.pool.query<Block>(
                'SELECT * FROM blocks ORDER BY number DESC LIMIT 1'
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to get latest block:', error);
            return null;
        }
    }

    async getBlock(number: number): Promise<Block | null> {
        try {
            const result = await this.pool.query<Block>(
                'SELECT * FROM blocks WHERE number = $1',
                [number]
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to get block:', error);
            return null;
        }
    }

    async insertBlock(block: Block): Promise<void> {
        try {
            await this.pool.query(
                `INSERT INTO blocks (
                    number, hash, parent_hash, timestamp,
                    transactions_count, gas_used, gas_limit, base_fee_per_gas
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (number) DO UPDATE SET
                    hash = EXCLUDED.hash,
                    parent_hash = EXCLUDED.parent_hash,
                    timestamp = EXCLUDED.timestamp,
                    transactions_count = EXCLUDED.transactions_count,
                    gas_used = EXCLUDED.gas_used,
                    gas_limit = EXCLUDED.gas_limit,
                    base_fee_per_gas = EXCLUDED.base_fee_per_gas`,
                [
                    block.number,
                    block.hash,
                    block.parent_hash,
                    block.timestamp,
                    block.transactions_count,
                    block.gas_used,
                    block.gas_limit,
                    block.base_fee_per_gas,
                ]
            );
        } catch (error) {
            logger.error('Failed to insert block:', error);
            throw error;
        }
    }

    // Existing transaction methods
    async insertTransaction(transaction: Transaction): Promise<void> {
        try {
            await this.pool.query(
                `INSERT INTO transactions (
                    hash, block_number, from_address, to_address,
                    value, gas_price, gas_used, input, status,
                    transaction_index, nonce, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (hash) DO UPDATE SET
                    block_number = EXCLUDED.block_number,
                    from_address = EXCLUDED.from_address,
                    to_address = EXCLUDED.to_address,
                    value = EXCLUDED.value,
                    gas_price = EXCLUDED.gas_price,
                    gas_used = EXCLUDED.gas_used,
                    input = EXCLUDED.input,
                    status = EXCLUDED.status,
                    transaction_index = EXCLUDED.transaction_index,
                    nonce = EXCLUDED.nonce,
                    created_at = EXCLUDED.created_at`,
                [
                    transaction.hash,
                    transaction.block_number,
                    transaction.from_address,
                    transaction.to_address,
                    transaction.value,
                    transaction.gas_price,
                    transaction.gas_used,
                    transaction.input,
                    transaction.status,
                    transaction.transaction_index,
                    transaction.nonce,
                    transaction.created_at
                ]
            );
        } catch (error) {
            logger.error('Failed to insert transaction:', error);
            throw error;
        }
    }

    async getTransaction(hash: string): Promise<Transaction | null> {
        try {
            const result = await this.pool.query<Transaction>(
                'SELECT * FROM transactions WHERE hash = $1',
                [hash]
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to get transaction:', error);
            return null;
        }
    }

    async getTransactionsByBlock(blockNumber: number): Promise<Transaction[]> {
        try {
            const result = await this.pool.query<Transaction>(
                'SELECT * FROM transactions WHERE block_number = $1 ORDER BY transaction_index ASC',
                [blockNumber]
            );
            return result.rows;
        } catch (error) {
            logger.error('Failed to get transactions by block:', error);
            return [];
        }
    }

    async getTransactionsByAddress(address: string, limit: number = 10, offset: number = 0): Promise<Transaction[]> {
        try {
            const result = await this.pool.query<Transaction>(
                'SELECT * FROM transactions WHERE from_address = $1 OR to_address = $1 ORDER BY block_number DESC, transaction_index DESC LIMIT $2 OFFSET $3',
                [address, limit, offset]
            );
            return result.rows;
        } catch (error) {
            logger.error('Failed to get transactions by address:', error);
            return [];
        }
    }

    async getLatestTransactions(limit: number = 10, offset: number = 0): Promise<Transaction[]> {
        try {
            const result = await this.pool.query<Transaction>(
                'SELECT * FROM transactions ORDER BY block_number DESC, transaction_index DESC LIMIT $1 OFFSET $2',
                [limit, offset]
            );
            return result.rows;
        } catch (error) {
            logger.error('Failed to get latest transactions:', error);
            return [];
        }
    }

    async getTotalTransactions(): Promise<number> {
        try {
            const result = await this.pool.query<{ count: string }>(
                'SELECT COUNT(*) as count FROM transactions'
            );
            return parseInt(result.rows[0].count);
        } catch (error) {
            logger.error('Failed to get total transactions:', error);
            return 0;
        }
    }

    // New contract verification methods
    async getContractVerification(address: string): Promise<ContractVerification | null> {
        try {
            const result = await this.pool.query<ContractVerification>(
                'SELECT * FROM contract_verifications WHERE address = $1',
                [address.toLowerCase()]
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to get contract verification:', error);
            return null;
        }
    }

    async insertContractVerification(verification: ContractVerification): Promise<void> {
        try {
            await this.pool.query(
                `INSERT INTO contract_verifications (
                    address, name, source_code, compiler_version,
                    optimization_used, optimization_runs, constructor_arguments,
                    abi, verified_at, is_verified, license_type,
                    verification_status, verification_error
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (address) DO UPDATE SET
                    name = EXCLUDED.name,
                    source_code = EXCLUDED.source_code,
                    compiler_version = EXCLUDED.compiler_version,
                    optimization_used = EXCLUDED.optimization_used,
                    optimization_runs = EXCLUDED.optimization_runs,
                    constructor_arguments = EXCLUDED.constructor_arguments,
                    abi = EXCLUDED.abi,
                    verified_at = EXCLUDED.verified_at,
                    is_verified = EXCLUDED.is_verified,
                    license_type = EXCLUDED.license_type,
                    verification_status = EXCLUDED.verification_status,
                    verification_error = EXCLUDED.verification_error`,
                [
                    verification.address.toLowerCase(),
                    verification.name,
                    verification.source_code,
                    verification.compiler_version,
                    verification.optimization_used,
                    verification.optimization_runs,
                    verification.constructor_arguments,
                    verification.abi,
                    verification.verified_at,
                    verification.is_verified,
                    verification.license_type,
                    verification.verification_status,
                    verification.verification_error
                ]
            );
        } catch (error) {
            logger.error('Failed to insert contract verification:', error);
            throw error;
        }
    }

    async updateVerificationStatus(
        address: string,
        status: 'pending' | 'success' | 'failure',
        error?: string
    ): Promise<void> {
        try {
            await this.pool.query(
                `UPDATE contract_verifications 
                SET verification_status = $1,
                    verification_error = $2,
                    is_verified = $3,
                    verified_at = $4
                WHERE address = $5`,
                [status, error, status === 'success', new Date(), address.toLowerCase()]
            );
        } catch (error) {
            logger.error('Failed to update verification status:', error);
            throw error;
        }
    }

    // Contract source methods
    async insertContractSource(source: ContractSource): Promise<void> {
        try {
            await this.pool.query(
                `INSERT INTO contract_sources (
                    address, filename, source_code, compiler_version,
                    abi, creation_bytecode, deployed_bytecode, is_primary
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (address, filename) DO UPDATE SET
                    source_code = EXCLUDED.source_code,
                    compiler_version = EXCLUDED.compiler_version,
                    abi = EXCLUDED.abi,
                    creation_bytecode = EXCLUDED.creation_bytecode,
                    deployed_bytecode = EXCLUDED.deployed_bytecode,
                    is_primary = EXCLUDED.is_primary`,
                [
                    source.address.toLowerCase(),
                    source.filename,
                    source.source_code,
                    source.compiler_version,
                    source.abi,
                    source.creation_bytecode,
                    source.deployed_bytecode,
                    source.is_primary
                ]
            );
        } catch (error) {
            logger.error('Failed to insert contract source:', error);
            throw error;
        }
    }

    async getContractSources(address: string): Promise<ContractSource[]> {
        try {
            const result = await this.pool.query<ContractSource>(
                'SELECT * FROM contract_sources WHERE address = $1 ORDER BY is_primary DESC',
                [address.toLowerCase()]
            );
            return result.rows;
        } catch (error) {
            logger.error('Failed to get contract sources:', error);
            return [];
        }
    }

    // Contract interface detection methods
    async insertContractInterface(address: string, interfaceType: string): Promise<void> {
        try {
            await this.pool.query(
                `INSERT INTO contract_interfaces (
                    address, interface_type, detected_at
                ) VALUES ($1, $2, $3)
                ON CONFLICT (address, interface_type) DO UPDATE SET
                    detected_at = EXCLUDED.detected_at`,
                [address.toLowerCase(), interfaceType, new Date()]
            );
        } catch (error) {
            logger.error('Failed to insert contract interface:', error);
            throw error;
        }
    }

    async getContractInterfaces(address: string): Promise<string[]> {
        try {
            const result = await this.pool.query<ContractInterface>(
                'SELECT interface_type FROM contract_interfaces WHERE address = $1',
                [address.toLowerCase()]
            );
            return result.rows.map(row => row.interface_type);
        } catch (error) {
            logger.error('Failed to get contract interfaces:', error);
            return [];
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}
