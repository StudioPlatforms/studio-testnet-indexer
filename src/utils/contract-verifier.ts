import { ethers } from 'ethers';
import { ContractVerification, DatabaseService } from '../services/database';
import { logger } from './logger';
import config from '../config';

interface CompilationResult {
    abi: any[];
    bytecode: string;
}

export async function verifyContract(
    verification: ContractVerification,
    database: DatabaseService
): Promise<void> {
    try {
        // Get deployed bytecode from chain
        const provider = new ethers.providers.JsonRpcProvider(config.rpc.url);
        const deployedBytecode = await provider.getCode(verification.address);

        // Compile source code
        const compilationResult = await compileContract(
            verification.source_code,
            verification.compiler_version,
            verification.optimization_used,
            verification.optimization_runs
        );

        // Compare bytecodes
        const bytecodeMatches = compareBytecode(
            compilationResult.bytecode,
            deployedBytecode,
            verification.constructor_arguments
        );

        if (bytecodeMatches) {
            // Update verification with success
            await database.updateVerificationStatus(
                verification.address,
                'success'
            );

            // Store ABI
            await database.insertContractVerification({
                ...verification,
                abi: JSON.stringify(compilationResult.abi),
                is_verified: true,
                verification_status: 'success',
                verified_at: new Date()
            });

            // Detect and store interfaces
            await detectAndStoreInterfaces(
                verification.address,
                compilationResult.abi,
                database
            );
        } else {
            await database.updateVerificationStatus(
                verification.address,
                'failure',
                'Compiled bytecode does not match deployed bytecode'
            );
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during verification';
        logger.error('Contract verification failed:', error);
        await database.updateVerificationStatus(
            verification.address,
            'failure',
            errorMessage
        );
    }
}

async function compileContract(
    sourceCode: string,
    compilerVersion: string,
    optimizationUsed: boolean,
    optimizationRuns: number
): Promise<CompilationResult> {
    // This is a placeholder for actual compilation logic
    // You would typically use solc or make an API call to a compilation service
    throw new Error('Compilation not implemented');
}

function compareBytecode(
    compiledBytecode: string,
    deployedBytecode: string,
    constructorArgs: string
): boolean {
    // Remove constructor arguments from deployed bytecode for comparison
    const deployedBytecodeWithoutConstructor = deployedBytecode.replace(constructorArgs, '');
    return compiledBytecode === deployedBytecodeWithoutConstructor;
}

async function detectAndStoreInterfaces(
    address: string,
    abi: any[],
    database: DatabaseService
): Promise<void> {
    const interfaceDetectors = {
        ERC20: ['balanceOf', 'transfer', 'approve', 'allowance', 'transferFrom'],
        ERC721: ['ownerOf', 'approve', 'transferFrom', 'safeTransferFrom'],
        ERC1155: ['balanceOf', 'balanceOfBatch', 'safeBatchTransferFrom'],
    };

    const functions = new Set(abi
        .filter(item => item.type === 'function')
        .map(item => item.name)
    );

    for (const [interfaceType, requiredFunctions] of Object.entries(interfaceDetectors)) {
        if (requiredFunctions.every(func => functions.has(func))) {
            await database.insertContractInterface(address, interfaceType);
        }
    }
}
