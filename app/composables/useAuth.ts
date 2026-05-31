export interface UserPlate {
  id: string
  plate: string
  label: string | null
  is_default: boolean
}

export interface UserProfile {
  id: string
  display_name: string | null
  default_city_id: string | null
  plates: UserPlate[]
}

export const useAuth = () => {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw error
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const getProfile = async (): Promise<UserProfile | null> => {
    if (!user.value) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, default_city_id, plates:user_plates(id, plate, label, is_default)')
      .eq('id', user.value.id)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return data as UserProfile | null
  }

  const updateProfile = async (updates: { display_name?: string; default_city_id?: string | null }) => {
    if (!user.value) throw new Error('Not logged in')
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.value.id, ...updates })
    if (error) throw error
  }

  const addPlate = async (plate: string, label: string, isDefault: boolean) => {
    if (!user.value) throw new Error('Not logged in')
    const cleaned = plate.toUpperCase().replace(/\s/g, '')
    if (isDefault) {
      await supabase.from('user_plates').update({ is_default: false }).eq('user_id', user.value.id)
    }
    const { error } = await supabase.from('user_plates').insert({
      user_id: user.value.id,
      plate: cleaned,
      label: label || null,
      is_default: isDefault,
    })
    if (error) throw error
  }

  const updatePlate = async (plateId: string, updates: { label?: string; is_default?: boolean }) => {
    if (!user.value) throw new Error('Not logged in')
    if (updates.is_default) {
      await supabase.from('user_plates').update({ is_default: false }).eq('user_id', user.value.id)
    }
    const { error } = await supabase.from('user_plates').update(updates).eq('id', plateId)
    if (error) throw error
  }

  const removePlate = async (plateId: string) => {
    const { error } = await supabase.from('user_plates').delete().eq('id', plateId)
    if (error) throw error
  }

  return { user, signUp, signIn, signOut, getProfile, updateProfile, addPlate, updatePlate, removePlate }
}
