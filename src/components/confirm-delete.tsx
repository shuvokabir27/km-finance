import { ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { hasAdminPin, verifyAdminPin } from "@/lib/admin-settings";
import { toast } from "sonner";

type Props = {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  relatedItems?: string[];
  confirmText?: string;
  onConfirm: () => void;
};

export function ConfirmDelete({
  trigger,
  title,
  description,
  relatedItems,
  confirmText = "হ্যাঁ, ডিলিট করুন",
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const pinRequired = hasAdminPin();

  const handleConfirm = (e: React.MouseEvent) => {
    if (pinRequired) {
      if (!verifyAdminPin(pin)) {
        e.preventDefault();
        toast.error("পিন ভুল");
        return;
      }
    }
    onConfirm();
    setPin("");
    setOpen(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPin("");
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>{description}</p>
              {relatedItems && relatedItems.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-1.5 font-medium text-destructive">
                    ⚠️ সতর্কতা: এর সাথে নিচের সকল হিসাবও মুছে যাবে —
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-foreground/80">
                    {relatedItems.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    এই কাজটি ফিরিয়ে আনা যাবে না।
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {pinRequired && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> অ্যাডমিন পিন (৪ ডিজিট)
            </Label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoFocus
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>বাতিল</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pinRequired && pin.length !== 4}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
