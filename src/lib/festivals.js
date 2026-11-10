// Festival presets. Fixed-date festivals pre-fill the date; lunar-calendar festivals
// change every year, so the date is left for the user to pick.
export const FESTIVALS = [
  { name: 'New Year', month: 1, day: 1, emoji: '🎆', message: 'Happy New Year {first_name}! 🎆 May this year bring you success, health and happiness.\n\n{company}' },
  { name: 'Makar Sankranti / Pongal', month: 1, day: 14, emoji: '🪁', message: 'Happy Sankranti {first_name}! 🪁 May this harvest festival fill your home with prosperity and joy.\n\n{company}' },
  { name: 'Republic Day', month: 1, day: 26, emoji: '🇮🇳', message: 'Happy Republic Day {first_name}! 🇮🇳\n\n{company}' },
  { name: 'Holi', emoji: '🎨', message: 'Happy Holi {first_name}! 🎨 May your life be filled with vibrant colours of joy.\n\n{company}' },
  { name: 'Ugadi / Gudi Padwa', emoji: '🌼', message: 'Happy Ugadi {first_name}! 🌼 Wishing you a prosperous new year ahead.\n\n{company}' },
  { name: 'Eid', emoji: '🌙', message: 'Eid Mubarak {first_name}! 🌙 May this Eid bring peace and happiness to you and your family.\n\n{company}' },
  { name: 'Independence Day', month: 8, day: 15, emoji: '🇮🇳', message: 'Happy Independence Day {first_name}! 🇮🇳\n\n{company}' },
  { name: 'Raksha Bandhan', emoji: '🪢', message: 'Happy Raksha Bandhan {first_name}! 🪢\n\n{company}' },
  { name: 'Ganesh Chaturthi', emoji: '🐘', message: 'Happy Ganesh Chaturthi {first_name}! 🐘 May Lord Ganesha bless you with wisdom and success.\n\n{company}' },
  { name: 'Dussehra', emoji: '🏹', message: 'Happy Dussehra {first_name}! 🏹 May good always triumph in your life.\n\n{company}' },
  { name: 'Diwali', emoji: '🪔', message: 'Happy Diwali {first_name}! 🪔 May the festival of lights brighten your life with happiness and prosperity.\n\n{company}' },
  { name: 'Christmas', month: 12, day: 25, emoji: '🎄', message: 'Merry Christmas {first_name}! 🎄 Wishing you joy and peace this festive season.\n\n{company}' },
]

// Next occurrence (today or later) of a fixed-date festival, as YYYY-MM-DD
export function nextFestivalDate(festival, from = new Date()) {
  if (!festival.month) return ''
  let year = from.getFullYear()
  const thisYear = new Date(year, festival.month - 1, festival.day)
  if (thisYear < new Date(from.getFullYear(), from.getMonth(), from.getDate())) year++
  return `${year}-${String(festival.month).padStart(2, '0')}-${String(festival.day).padStart(2, '0')}`
}
