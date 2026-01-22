import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Search } from "lucide-react";
import type { Enums } from "@/integrations/supabase/types";

const VERTICALS: Array<Enums<'content_vertical'> | 'all'> = [
  'all', 'privacy', 'education', 'health', 'hyperlocal'
];

interface QAInboxFiltersProps {
  vertical: Enums<'content_vertical'> | 'all';
  onVerticalChange: (value: Enums<'content_vertical'> | 'all') => void;
  accountId: string;
  onAccountChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  accounts: Array<{ account_id: string; vertical: Enums<'content_vertical'> }>;
}

export function QAInboxFilters({
  vertical,
  onVerticalChange,
  accountId,
  onAccountChange,
  search,
  onSearchChange,
  accounts,
}: QAInboxFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Filters:</span>
      </div>

      <Select value={vertical} onValueChange={onVerticalChange}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Vertical" />
        </SelectTrigger>
        <SelectContent>
          {VERTICALS.map((v) => (
            <SelectItem key={v} value={v}>
              {v === 'all' ? 'All verticals' : v.charAt(0).toUpperCase() + v.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={accountId} onValueChange={onAccountChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((acc) => (
            <SelectItem key={acc.account_id} value={acc.account_id}>
              {acc.account_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search hooks, flags, errors..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
