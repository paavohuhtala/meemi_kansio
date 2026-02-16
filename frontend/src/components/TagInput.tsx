import { useEffect, useRef, useState } from 'react';
import { Cross1Icon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { searchTags } from '../api/media';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  cursor: text;
  position: relative;

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
`;

const ChipRemove = styled.button`
  all: unset;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 1px;
  border-radius: 2px;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }

  svg {
    width: 10px;
    height: 10px;
  }
`;

const InlineInput = styled.input`
  all: unset;
  flex: 1;
  min-width: 80px;
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.colors.text};
  padding: 2px 0;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Dropdown = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.xs} 0;
  list-style: none;
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
`;

const DropdownItem = styled.li<{ $highlighted?: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  background: ${({ $highlighted, theme }) =>
    $highlighted ? theme.colors.surfaceHover : 'transparent'};

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`;

function normalizeTag(input: string): string {
  return input.trim().toLowerCase();
}

export function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced query
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(input), 200);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: suggestions } = useQuery({
    queryKey: ['tags', debouncedQuery],
    queryFn: () => searchTags(debouncedQuery),
    enabled: open && debouncedQuery.length > 0,
  });

  const filteredSuggestions =
    suggestions?.tags.filter((t) => !tags.includes(t.name)) ?? [];

  function addTag(name: string) {
    const normalized = normalizeTag(name);
    if (
      normalized &&
      normalized.length <= 30 &&
      !normalized.match(/\s/) &&
      !tags.includes(normalized)
    ) {
      onChange([...tags, normalized]);
    }
    setInput('');
    setOpen(false);
    setHighlightIndex(-1);
  }

  function removeTag(name: string) {
    onChange(tags.filter((t) => t !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filteredSuggestions.length) {
        addTag(filteredSuggestions[highlightIndex].name);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) =>
        i < filteredSuggestions.length - 1 ? i + 1 : i,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIndex(-1);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
    setOpen(true);
    setHighlightIndex(-1);
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <Container
      ref={containerRef}
      onClick={() => inputRef.current?.focus()}
      data-testid="tag-input"
    >
      {tags.map((tag) => (
        <Chip key={tag} data-testid="tag-chip">
          {tag}
          <ChipRemove
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
            aria-label={`Remove ${tag}`}
          >
            <Cross1Icon />
          </ChipRemove>
        </Chip>
      ))}
      <InlineInput
        ref={inputRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => input && setOpen(true)}
        placeholder={tags.length === 0 ? placeholder : undefined}
        maxLength={30}
        data-testid="tag-input-field"
      />
      {open && filteredSuggestions.length > 0 && (
        <Dropdown role="listbox" data-testid="tag-suggestions">
          {filteredSuggestions.map((tag, i) => (
            <DropdownItem
              key={tag.id}
              role="option"
              $highlighted={i === highlightIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(tag.name);
              }}
            >
              {tag.name}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </Container>
  );
}
