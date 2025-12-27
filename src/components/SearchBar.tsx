import React, { useState, useEffect, useRef, useCallback } from 'react';
import { gazetteerService, PlaceResult } from '../services/GazetteerService';

interface SearchBarProps {
  onSearch: (lat: number, lon: number, placeName?: string) => void;
  isOnline?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isOnline = true }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const searchResults = await gazetteerService.search(searchQuery, 8);
      setResults(searchResults);
      setIsOpen(searchResults.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          selectPlace(results[selectedIndex]);
        } else if (results.length > 0) {
          selectPlace(results[0]);
        } else {
          // Try to parse as coordinates
          const coordMatch = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
          if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lon = parseFloat(coordMatch[2]);
            onSearch(lat, lon);
            setIsOpen(false);
            setQuery('');
          }
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Handle place selection
  const selectPlace = (place: PlaceResult) => {
    onSearch(place.lat, place.lon, place.displayName);
    setQuery(place.name);
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current && 
        !inputRef.current.contains(e.target as Node) &&
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get type icon
  const getTypeIcon = (type: PlaceResult['type']) => {
    switch (type) {
      case 'city':
        return '🏙️';
      case 'town':
        return '🏘️';
      case 'village':
        return '🏡';
      case 'district':
        return '📍';
      case 'taluk':
        return '📌';
      case 'landmark':
        return '🗿';
      case 'natural':
        return '🌲';
      default:
        return '📍';
    }
  };

  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search places, districts, or coordinates..."
          aria-label="Search location"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {isLoading && <span className="search-spinner">⟳</span>}
        {!isOnline && <span className="offline-badge" title="Offline mode">📴</span>}
      </div>

      {isOpen && results.length > 0 && (
        <div ref={resultsRef} className="search-results" role="listbox">
          {results.map((result, index) => (
            <div
              key={result.id}
              className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => selectPlace(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              aria-selected={index === selectedIndex}
            >
              <span className="result-icon">{getTypeIcon(result.type)}</span>
              <div className="result-text">
                <div className="result-name">{result.name}</div>
                <div className="result-detail">
                  {result.district && `${result.district}, `}
                  {result.state || 'Karnataka'}
                </div>
              </div>
              <span className="result-type">{result.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
