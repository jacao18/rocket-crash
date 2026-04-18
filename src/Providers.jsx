import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, defineChain } from 'viem'
import { mainnet } from 'viem/chains'

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
  chains: [minatoTestnet, mainnet],
  transports: {
    [minatoTestnet.id]: http(),
    [mainnet.id]: http(),
  },
})

const queryClient = new QueryClient()

const isAdmin = typeof window !== 'undefined' && window.location.pathname === '/admin'

export function Providers({ children }) {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        // Admin uses external wallet; game uses Google + embedded wallet
        loginMethods: isAdmin ? ['wallet'] : ['google'],
        appearance: {
          theme: 'dark',
          accentColor: isAdmin ? '#5ba3d9' : '#f97316',
          logo: 'https://rocket-crash-two.vercel.app/favicon.ico',
          walletList: ['detected_wallets'],
        },
        embeddedWallets: {
          createOnLogin: isAdmin ? 'off' : 'users-without-wallets',
        },
        defaultChain: minatoTestnet,
        supportedChains: [minatoTestnet, mainnet],
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
