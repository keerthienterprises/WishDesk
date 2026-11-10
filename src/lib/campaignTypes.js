import { Cake, Heart, Megaphone, MessageSquareText, Sparkles, Tag } from 'lucide-react'

// `dateField` marks recurring occasions: each contact is wished on their own date
export const CAMPAIGN_TYPES = {
  birthday: {
    label: 'Birthday',
    icon: Cake,
    color: '#b4235a',
    dateField: 'dob',
    description: 'Each client is wished on their own birthday',
    defaultMessage: 'Happy Birthday {first_name}! 🎉 Wishing you a wonderful year ahead filled with joy, health and success.\n\nWarm wishes,\n{company}',
  },
  anniversary: {
    label: 'Anniversary',
    icon: Heart,
    color: '#6b4fa0',
    dateField: 'anniversary',
    description: 'Wedding anniversaries, wished on the day',
    defaultMessage: 'Happy Anniversary {first_name}! 💐 Wishing you many more years of love and happiness.\n\nWarm wishes,\n{company}',
  },
  festival: {
    label: 'Festival',
    icon: Sparkles,
    color: '#c47f0b',
    description: 'Diwali, Sankranti, Eid, Christmas, New Year',
    defaultMessage: 'Dear {first_name}, warm wishes to you and your family on this festive occasion! ✨\n\n{company}',
  },
  offer: {
    label: 'Offer',
    icon: Tag,
    color: '#1f7a4d',
    description: 'Discounts, new launches, seasonal deals',
    defaultMessage: 'Hi {first_name}! 🎁 We have an exclusive offer just for you. Reply to this message to know more.\n\n{company}',
  },
  announcement: {
    label: 'Announcement',
    icon: Megaphone,
    color: '#2b5a8a',
    description: 'New services, office updates, news',
    defaultMessage: 'Hi {first_name}, we have some exciting news to share with you!\n\n{company}',
  },
  custom: {
    label: 'Custom',
    icon: MessageSquareText,
    color: '#5f6b66',
    description: 'Anything else you want to send',
    defaultMessage: 'Hi {first_name},\n\n{company}',
  },
}

export const TYPE_KEYS = Object.keys(CAMPAIGN_TYPES)
export const typeMeta = (type) => CAMPAIGN_TYPES[type] ?? CAMPAIGN_TYPES.custom
export const isRecurring = (type) => Boolean(typeMeta(type).dateField)

export const MESSAGE_VARIABLES = [
  { key: '{first_name}', label: 'First name' },
  { key: '{name}', label: 'Full name' },
  { key: '{company}', label: 'Your company' },
  { key: '{sender}', label: 'Your name' },
]
