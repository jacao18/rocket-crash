import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, defineChain } from 'viem'

// Soneium Minato Testnet
export const minatoTestnet = defineChain({
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.minato.soneium.org/'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer-testnet.soneium.org' },
  },
  testnet: true,
})

const wagmiConfig = createConfig({
  chains: [minatoTestnet],
  transports: {
    [minatoTestnet.id]: http(),
  },
})

const queryClient = new QueryClient()

export function Providers({ children }) {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['google', 'apple', 'wallet', 'email'],
        appearance: {
          theme: 'light',
          accentColor: '#5b6cf9',
          logo: 'https://cometgames.xyz/comet-icon.png',
          landingHeader: 'Log in or sign up',
          loginMessage: '',
          walletList: ['rabby', 'metamask', 'rainbow', 'coinbase_wallet', 'wallet_connect'],
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        externalWallets: {
          coinbaseWallet: { connectionOptions: 'all' },
        },
        defaultChain: minatoTestnet,
        supportedChains: [minatoTestnet],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
