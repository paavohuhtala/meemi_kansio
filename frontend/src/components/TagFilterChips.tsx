import { useEffect, useRef, useState } from 'react';
import { Cross1Icon, PlusIcon } from '@radix-ui/react-icons';
import { useQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { searchTags } from '../api/media';

interface TagFilterChipsProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

// --- Styled components ---

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  align-items: center;
`;

const FilterChip = styled.span`
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

const AddTagButton = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.text};
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const InputWrapper = styled.div`
  position: relative;
  display: inline-flex;
`;

const InlineInput = styled.input`
  all: unset;
  min-width: 120px;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const Dropdown = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.xs} 0;
  list-style: none;
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
  min-width: 180px;
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

// --- Helpers ---

function normalizeTag(input: string): string {
  return input.trim().toLowerCase().replace(/\s/g, '').slice(0, 30);
}

// --- Component ---

export function TagFilterChips({ tags, onAdd, onRemove }: TagFilterChipsProps) {
  const [showInput, setShowInput] = useState(false);
  const [input, setInput] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // Debounced query for autocomplete
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(input), 200);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: suggestions } = useQuery({
    queryKey: ['tags', debouncedQuery],
    queryFn: () => searchTags(debouncedQuery),
    enabled: showInput && debouncedQuery.length > 0,
  });

  // Filter out tags already in the tags prop
  const tagsSet = new Set(tags);
  const filteredSuggestions =
    suggestions?.tags.filter((t) => !tagsSet.has(t.name)) ?? [];

  const showDropdown =
    showInput && filteredSuggestions.length > 0 && input.length > 0;

  // --- Actions ---

  function addTag(name: string) {
    const normalized = normalizeTag(name);
    if (normalized.length === 0 || tags.includes(normalized)) return;

    onAdd(normalized);
    setInput('');
    setHighlightIndex(-1);
    // Keep input open and focused
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function openInput() {
    setShowInput(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function closeInput() {
    setShowInput(false);
    setInput('');
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeInput();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (
        highlightIndex >= 0 &&
        highlightIndex < filteredSuggestions.length
      ) {
        addTag(filteredSuggestions[highlightIndex].name);
      } else {
        const normalized = normalizeTag(input);
        if (normalized.length > 0) {
          addTag(normalized);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) =>
        i < filteredSuggestions.length - 1 ? i + 1 : i,
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
      return;
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
    setHighlightIndex(-1);
  }

  // Close input when clicking outside
  useEffect(() => {
    if (!showInput) return;

    function handleClick(e: MouseEvent) {
      if (
        inputWrapperRef.current &&
        !inputWrapperRef.current.contains(e.target as Node)
      ) {
        closeInput();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showInput]);

  return (
    <ChipRow data-testid="tag-filter-chips">
      {tags.map((tag) => (
        <FilterChip key={tag} data-testid="filter-tag-chip">
          {tag}
          <ChipRemove
            onClick={() => onRemove(tag)}
            aria-label={`Remove ${tag}`}
          >
            <Cross1Icon />
          </ChipRemove>
        </FilterChip>
      ))}

      {showInput ? (
        <InputWrapper ref={inputWrapperRef}>
          <InlineInput
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type tag name..."
            maxLength={30}
            data-testid="add-filter-tag-input"
            autoComplete="off"
          />
          {showDropdown && (
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
        </InputWrapper>
      ) : (
        <AddTagButton
          onClick={openInput}
          data-testid="add-filter-tag-button"
          type="button"
        >
          <PlusIcon /> Add tag
        </AddTagButton>
      )}
    </ChipRow>
  );
}
