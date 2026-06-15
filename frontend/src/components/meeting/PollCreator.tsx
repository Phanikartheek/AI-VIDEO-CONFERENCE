/**
 * PollCreator — modal for host to create a new live poll.
 */
import { useState } from 'react';
import { BarChart3, Plus, Trash2, X } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Card from '../ui/Card';

interface PollCreatorProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => void;
}

export default function PollCreator({ open, onClose, onSubmit }: PollCreatorProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  if (!open) return null;

  const addOption = () => { if (options.length < 6) setOptions([...options, '']); };
  const removeOption = (i: number) => { if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i)); };
  const updateOption = (i: number, v: string) => { const n = [...options]; n[i] = v; setOptions(n); };

  const canSubmit = question.trim() && options.filter(o => o.trim()).length >= 2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(question.trim(), options.filter(o => o.trim()));
    setQuestion('');
    setOptions(['', '']);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6 mx-4 bg-gray-950/95 border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Create Poll</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <Input label="Question" placeholder="What should we discuss next?" value={question}
            onChange={e => setQuestion(e.target.value)} />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Options</label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <Input placeholder={`Option ${i + 1}`} value={opt}
                  onChange={e => updateOption(i, e.target.value)} />
                {options.length > 2 && (
                  <button onClick={() => removeOption(i)} className="text-gray-500 hover:text-red-400 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button onClick={addOption}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer mt-1">
                <Plus className="w-3 h-3" /> Add option
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            <BarChart3 className="w-3.5 h-3.5" /> Launch Poll
          </Button>
        </div>
      </Card>
    </div>
  );
}
