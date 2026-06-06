import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface ToastStackProps { successToast: string | null; errorToast: string | null; }

export function ToastStack({ successToast, errorToast }: ToastStackProps) {
  return (
    <div className="fixed right-4 top-20 z-[400] flex flex-col gap-2">
      <AnimatePresence>
        {successToast && (
          <motion.div key="s"
            initial={{ opacity: 0, x: 36, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 36, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2.5 rounded-2xl bg-slate-950/90 border border-emerald-400/20 px-4 py-2.5 text-xs text-emerald-200 shadow-xl backdrop-blur-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {successToast}
          </motion.div>
        )}
        {errorToast && (
          <motion.div key="e"
            initial={{ opacity: 0, x: 36, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 36, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2.5 rounded-2xl bg-slate-950/90 border border-rose-400/20 px-4 py-2.5 text-xs text-rose-200 shadow-xl backdrop-blur-sm"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            {errorToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
