import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CircleUser,
  Database,
  DatabaseX,
  Gauge,
  HelpCircle,
  Plus,
  Rows3,
  Search,
  Settings,
  Table2,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';

const map = {
  database: Database,
  add: Plus,
  table_chart: Table2,
  terminal: Terminal,
  speed: Gauge,
  table_rows: Rows3,
  settings: Settings,
  help: HelpCircle,
  notifications: Bell,
  account_circle: CircleUser,
  search: Search,
  arrow_drop_down: ChevronDown,
  close: X,
  delete: Trash2,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  arrow_drop_up: ChevronUp,
  unfold_more: ChevronsUpDown,
  database_off: DatabaseX,
};

export default function Icon({ name, className = '', size = 20 }) {
  const Cmp = map[name] || Database;
  return <Cmp className={className} size={size} strokeWidth={2} />;
}
