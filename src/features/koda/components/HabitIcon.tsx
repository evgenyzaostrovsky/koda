import {
  AlarmClock, Apple, Armchair, Bike, Book, BookOpen, Brain, Bookmark, Briefcase, Brush, CalendarCheck, Camera,
  Check, ChefHat, CircleCheck, CircleHelp, ClipboardList, Clock, Code2, Coffee, Compass, Dumbbell,
  Droplet, Ear, Flower2, Footprints, Gamepad2, Gift, GlassWater, GraduationCap,
  HandHeart, Headphones, Heart, HeartPulse, House, Laptop, Leaf, Lightbulb,
  ListChecks, Mail, Map, Medal, Microscope, Moon, Mountain, Music, Notebook,
  Palette, PenLine, PersonStanding, Phone, Pill, Plane, Presentation, Salad,
  FileText, KeyRound, MapPin, PartyPopper, Scissors, ShieldCheck, ShoppingBasket, ShowerHead, Smile, Sparkles, Sprout,
  StretchHorizontal, Sun, Sunrise, Target, Timer, Train, Trophy, Utensils, Wallet, Waves, Wind, Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from 'react-native';
import { HABIT_ICONS } from '../habitModel';

export const habitIconGroups = [
  { name: 'Учёба', icons: [
    ['laptop', 'Ноутбук', Laptop, 'учёба обучение компьютер занятия'],
    ['graduation', 'Выпускная шапка', GraduationCap, 'обучение курс знания'], ['book', 'Книга', BookOpen, 'чтение литература страницы'],
    ['notebook', 'Конспект', Notebook, 'записи лекция'], ['brain', 'Мышление', Brain, 'память концентрация'],
    ['language', 'Языки', Ear, 'иностранный слова практика'], ['calculator', 'Математика', ClipboardList, 'расчёты задачи'],
    ['science', 'Наука', Microscope, 'исследования лаборатория'], ['idea', 'Идеи', Lightbulb, 'изучать понимание'],
    ['presentation', 'Лекция', Presentation, 'занятие вебинар'], ['checklist', 'Практика', ListChecks, 'задания повторение'],
    ['target', 'Цель', Target, 'план фокус'], ['timer', 'Помодоро', Timer, 'таймер сессия'],
    ['bookmark', 'Закладка', Bookmark, 'сохранить важное'], ['file', 'Документ', FileText, 'материалы текст'],
  ]},
  { name: 'Работа', icons: [
    ['briefcase', 'Портфель', Briefcase, 'работа карьера дела офис'],
    ['calendar', 'Календарь', CalendarCheck, 'планирование расписание'], ['clipboard', 'Список дел', ClipboardList, 'задачи список'],
    ['code', 'Код', Code2, 'программирование разработка'], ['mail', 'Почта', Mail, 'письма сообщения'],
    ['phone', 'Звонки', Phone, 'телефон общение'], ['presentation', 'Презентация', Presentation, 'выступление встреча'],
    ['coffee', 'Перерыв', Coffee, 'пауза отдых кофе'], ['wallet', 'Финансы', Wallet, 'деньги бюджет'],
    ['target', 'Фокус', Target, 'цель результат'], ['shield', 'Безопасность', ShieldCheck, 'защита порядок'],
    ['clock', 'Вовремя', Clock, 'пунктуальность часы'], ['pin', 'На месте', MapPin, 'место поездка'],
  ]},
  { name: 'Здоровье', icons: [
    ['dumbbell', 'Спорт', Dumbbell, 'тренировка фитнес силовые'], ['droplet', 'Вода', Droplet, 'пить гидратация'],
    ['moon', 'Сон', Moon, 'отдых ночь режим'], ['heart', 'Здоровье', HeartPulse, 'самочувствие сердце'],
    ['meditation', 'Медитация', Wind, 'дыхание спокойствие осознанность'], ['walk', 'Прогулка', PersonStanding, 'ходьба шаги'],
    ['bike', 'Велосипед', Bike, 'езда кардио'], ['footprints', 'Шаги', Footprints, 'движение ходьба'],
    ['pill', 'Лекарства', Pill, 'таблетки терапия'], ['apple', 'Фрукты', Apple, 'еда питание перекус'],
    ['salad', 'Питание', Salad, 'еда овощи рацион'], ['sun', 'Свет', Sun, 'солнечный витамин д'],
    ['stretch', 'Растяжка', StretchHorizontal, 'йога гибкость разминка'], ['shower', 'Душ', ShowerHead, 'гигиена'],
    ['water', 'Стакан воды', GlassWater, 'питьевой режим'], ['smile', 'Настроение', Smile, 'эмоции забота'],
    ['alarm', 'Подъём', AlarmClock, 'будильник утро режим'], ['check', 'Проверка', CircleCheck, 'осмотр здоровье'],
  ]},
  { name: 'Быт', icons: [
    ['home', 'Дом', House, 'домашние дела уборка'], ['utensils', 'Готовка', Utensils, 'кухня еда рецепт'],
    ['chef', 'Повар', ChefHat, 'приготовить готовить'], ['laundry', 'Стирка', Waves, 'одежда бельё'],
    ['shopping', 'Покупки', ShoppingBasket, 'магазин продукты список'], ['wrench', 'Ремонт', Wrench, 'починить мастерить'],
    ['plant', 'Растения', Sprout, 'полив сад цветы'], ['leaf', 'Забота о себе', Leaf, 'уход привычка'],
    ['scissors', 'Уход', Scissors, 'стрижка ногти'], ['wallet', 'Бюджет', Wallet, 'расходы накопления'],
    ['calendar', 'Порядок', CalendarCheck, 'расписание план'], ['gift', 'Доброе дело', HandHeart, 'помощь близкие'],
    ['key', 'Ключи на месте', KeyRound, 'порядок собрать'], ['brush', 'Чистка', Brush, 'уборка поверхности'],
  ]},
  { name: 'Творчество', icons: [
    ['palette', 'Рисование', Palette, 'арт краски творчество'], ['pen', 'Письмо', PenLine, 'дневник текст заметки'],
    ['music', 'Музыка', Music, 'инструмент пение'], ['camera', 'Фото', Camera, 'снимать фотография'],
    ['scissors', 'Рукоделие', Scissors, 'шить вязать поделки'], ['lightbulb', 'Идеи', Lightbulb, 'создание вдохновение'],
    ['book', 'Чтение', Book, 'истории литература'], ['code', 'Создание', Code2, 'проект разработка'],
    ['sparkles', 'Творческий ритуал', Sparkles, 'вдохновение'], ['gift', 'Мастерить', Gift, 'сделать своими руками'],
    ['party', 'Праздник', PartyPopper, 'отметить маленькую победу'], ['trophy', 'Мастерство', Trophy, 'практика успех'],
  ]},
  { name: 'Отдых', icons: [
    ['headphones', 'Подкаст', Headphones, 'слушать аудио'], ['game', 'Игра', Gamepad2, 'играть досуг'],
    ['armchair', 'Тихий отдых', Armchair, 'пауза расслабление'], ['coffee', 'Чай или кофе', Coffee, 'напиток перерыв'],
    ['mountain', 'Природа', Mountain, 'поход улица'], ['plane', 'Путешествие', Plane, 'поездка отпуск'],
    ['train', 'Поездка', Train, 'дорога транспорт'], ['compass', 'Открытия', Compass, 'исследовать прогулка'],
    ['flower', 'Цветы', Flower2, 'природа сад'], ['sunrise', 'Утро', Sunrise, 'рассвет начало дня'],
    ['moon', 'Вечер', Moon, 'ночь завершение дня'], ['other', 'Другое', CircleHelp, 'своё'],
    ['clock', 'Медленный ритм', Clock, 'отдых без спешки'], ['alarm', 'Свободное утро', AlarmClock, 'выходной сон'],
  ]},
] as const satisfies { name: string; icons: readonly (readonly [string, string, LucideIcon, string])[] }[];

export const habitIconChoices = habitIconGroups.flatMap(group => group.icons.map(([name, label, Icon]) => ({ name, label, Icon, group: group.name })));

/** Unknown and legacy glyph values remain safe at display time; the saved icon is never rewritten. */
export function HabitIcon({ name, size = 20, color = 'currentColor' }: { name?: string; size?: number; color?: string }) {
  const savedKey = HABIT_ICONS.find(item => item.emoji === name)?.key ?? name;
  const choice = habitIconChoices.find(item => item.name === savedKey);
  if (!choice && name) return <Text accessible={false} style={{fontSize:size,lineHeight:size+5,color}}>{name}</Text>;
  const Icon = choice?.Icon ?? Sparkles;
  return <Icon size={size} color={color} fill={['moon','droplet','dumbbell'].includes(savedKey ?? '') ? color : 'none'} aria-hidden />;
}
