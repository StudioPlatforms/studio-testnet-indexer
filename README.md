# Studio Chain Testnet Indexer

A high-performance blockchain indexer for Studio Chain Testnet that provides real-time indexing of blocks, transactions, and smart contracts with a comprehensive REST API.

## Features

- Real-time block and transaction indexing
- Smart contract verification and ABI storage
- Comprehensive REST API for blockchain data access
- Support for ERC20, ERC721, and ERC1155 interface detection
- Transaction receipt logging with detailed gas metrics
- PostgreSQL database for efficient data storage

## API Endpoints

### Blocks
- `GET /blocks` - Get latest blocks with pagination
- `GET /blocks/:number` - Get block by number with transactions

### Transactions
- `GET /transactions/latest` - Get latest transactions
- `GET /transactions/:hash` - Get transaction by hash
- `GET /transactions/count` - Get total transactions count
- `GET /address/:address/transactions` - Get transactions by address

### Smart Contracts
- Contract verification endpoints
- Interface detection
- Source code storage and retrieval

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start the indexer:
```bash
npm run build
npm start
```

## Environment Variables

- `RPC_URL` - Blockchain RPC endpoint
- `WS_URL` - WebSocket endpoint
- `DATABASE_URL` - PostgreSQL connection string
- `API_PORT` - Port for the API server

## Development

```bash
# Run in development mode
npm run dev

# Build the project
npm run build

# Run tests
npm test
```

## Database Schema

The indexer uses PostgreSQL with the following main tables:
- blocks
- transactions
- contract_verifications
- contract_sources
- contract_interfaces

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT License - see LICENSE file for details

## Contact

For questions and support, please open an issue in the GitHub repository.
