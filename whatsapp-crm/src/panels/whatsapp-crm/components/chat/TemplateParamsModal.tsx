import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Loader2, X } from 'lucide-react';
import { extractPlaceholders } from '../../lib/whatsapp';

interface TemplateData {
  id: number;
  name: string;
  language: string;
  components: any[];
}

interface TemplateParamsModalProps {
  template: TemplateData;
  onSend: (paramValues: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

export function TemplateParamsModal({ template, onSend, onClose }: TemplateParamsModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const bodyComp = (template.components || []).find((c: any) => (c.type || '').toUpperCase() === 'BODY');
  const bodyText: string = bodyComp?.text || '';
  const paramCount = extractPlaceholders(bodyText);

  const headerComp = (template.components || []).find((c: any) => (c.type || '').toUpperCase() === 'HEADER');
  const headerText: string = headerComp?.text || '';
  const headerParamCount = extractPlaceholders(headerText);

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(values);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#111b21]">Fill Template Parameters</h3>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111b21]"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 rounded-lg bg-[#f0f2f5] p-3">
          <p className="font-medium text-sm text-[#111b21]">{template.name}</p>
          <p className="text-xs text-[#667781] mt-0.5">Language: {template.language}</p>
        </div>

        <div className="space-y-4">
          {headerParamCount > 0 && (
            <div>
              <Label className="text-xs">Header</Label>
              <p className="text-sm text-[#667781] mb-1">{headerText}</p>
              {Array.from({ length: headerParamCount }).map((_, i) => (
                <Input
                  key={`header-${i}`}
                  placeholder={`Header parameter ${i + 1}`}
                  value={values[`header_${i + 1}`] || ''}
                  onChange={(e) => setValues({ ...values, [`header_${i + 1}`]: e.target.value })}
                  className="mb-2"
                />
              ))}
            </div>
          )}

          {paramCount > 0 && (
            <div>
              <Label className="text-xs">Body</Label>
              <div className="rounded-lg bg-[#f0f2f5] p-3 mb-2">
                <p className="text-sm text-[#667781] whitespace-pre-wrap">{bodyText}</p>
              </div>
              {Array.from({ length: paramCount }).map((_, i) => (
                <Input
                  key={`body-${i}`}
                  placeholder={`Value for {{${i + 1}}}`}
                  value={values[String(i + 1)] || ''}
                  onChange={(e) => setValues({ ...values, [String(i + 1)]: e.target.value })}
                  className="mb-2"
                />
              ))}
            </div>
          )}

          {paramCount === 0 && headerParamCount === 0 && (
            <p className="text-sm text-[#667781]">This template has no parameters. Send as-is?</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Send Template
          </Button>
        </div>
      </div>
    </div>
  );
}
