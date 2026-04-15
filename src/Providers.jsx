import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'viem'
import { defineChain } from 'viem/chains'

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
        loginMethods: ['google'],
        appearance: {
          theme: 'dark',
          accentColor: '#f97316',
          logo: 'https://rocket-crash-two.vercel.app/favicon.ico',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
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
