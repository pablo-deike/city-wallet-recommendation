import { useState } from 'react'
import UserView from './components/user/UserView'
import MerchantView from './components/merchant/MerchantView'
import TabBar from './TabBar'

export default function App() {
  const [tab, setTab] = useState('user')

  return (
    <>
      {tab === 'user'     && <UserView     key="user"     />}
      {tab === 'merchant' && <MerchantView key="merchant" />}
      <TabBar active={tab} onSwitch={setTab} />
    </>
  )
}
