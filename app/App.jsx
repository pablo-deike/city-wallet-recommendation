import { useState } from 'react'
import UserView from './components/user/UserView'
import MerchantView from './components/merchant/MerchantView'

export default function App() {
  const [view, setView] = useState('user')

  return (
    <>
      {view === 'user'     && <UserView     onGoToMerchant={() => setView('merchant')} />}
      {view === 'merchant' && <MerchantView onBack={() => setView('user')} />}
    </>
  )
}
