import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { setDefaultCountryCode } from '../lib/whatsapp'

const DEFAULTS = { company_name: 'Our Company', default_country_code: '91', signature: '' }
const SettingsContext = createContext({ settings: DEFAULTS, refresh: () => {} })

// Organisation-wide settings (company name used in {company}, default country code)
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('org_settings').select('*').eq('id', 1).maybeSingle()
    if (data) {
      setSettings(data)
      setDefaultCountryCode(data.default_country_code)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return <SettingsContext.Provider value={{ settings, refresh }}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
