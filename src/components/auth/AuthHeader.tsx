import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, Shield, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

export function AuthHeader() {
  const { user, isLoading, signOut, hasRole } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setRoleLoading(true);
      // Check for roles in order of precedence
      hasRole(['admin']).then(isAdmin => {
        if (isAdmin) {
          setUserRole('admin');
          setRoleLoading(false);
        } else {
          hasRole(['qa']).then(isQa => {
            setUserRole(isQa ? 'qa' : null);
            setRoleLoading(false);
          });
        }
      });
    } else {
      setUserRole(null);
    }
  }, [user, hasRole]);

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  if (!user) {
    return (
      <Link to="/login">
        <Button variant="outline" size="sm" className="gap-2">
          <User className="w-4 h-4" />
          Sign In
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <User className="w-4 h-4" />
          <span className="max-w-[150px] truncate">{user.email}</span>
          {roleLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : userRole ? (
            <Badge 
              variant="outline" 
              className={
                userRole === 'admin' 
                  ? "text-success border-success/50" 
                  : "text-warning border-warning/50"
              }
            >
              <Shield className="w-3 h-3 mr-1" />
              {userRole}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              viewer
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-sm">
          <p className="font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            {userRole ? `Role: ${userRole}` : 'No QA access'}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
