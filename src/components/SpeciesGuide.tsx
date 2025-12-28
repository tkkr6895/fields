import React, { useState } from 'react';

interface Species {
  id: string;
  commonName: string;
  scientificName: string;
  localName?: string;
  category: 'tree' | 'shrub' | 'herb' | 'climber' | 'grass' | 'fern' | 'palm';
  conservationStatus?: 'LC' | 'NT' | 'VU' | 'EN' | 'CR';
  endemic: boolean;
  medicinal: boolean;
  restorationValue: 'high' | 'medium' | 'low';
  habitat: string[];
  characteristics: string;
  uses?: string;
  image?: string;
}

interface SpeciesGuideProps {
  onClose: () => void;
  onRecordSpecies: (speciesId: string) => void;
}

// Common Western Ghats species for restoration
const speciesData: Species[] = [
  {
    id: 'tectona-grandis',
    commonName: 'Teak',
    scientificName: 'Tectona grandis',
    localName: 'Sagwan (Hindi), Theku (Kannada)',
    category: 'tree',
    conservationStatus: 'LC',
    endemic: false,
    medicinal: true,
    restorationValue: 'medium',
    habitat: ['Deciduous forest', 'Plantation'],
    characteristics: 'Large deciduous tree, 30-40m tall. Large leaves (30-60cm), small white flowers. Bark grey-brown, fissured.',
    uses: 'Premium timber, medicinal (bark for inflammation), erosion control'
  },
  {
    id: 'terminalia-arjuna',
    commonName: 'Arjuna',
    scientificName: 'Terminalia arjuna',
    localName: 'Arjun (Hindi), Matthi (Kannada)',
    category: 'tree',
    conservationStatus: 'LC',
    endemic: false,
    medicinal: true,
    restorationValue: 'high',
    habitat: ['Riverine', 'Moist deciduous'],
    characteristics: 'Large evergreen tree, 20-25m. Smooth grey bark that peels in sheets. Buttressed trunk. Leaves oblong with two glands.',
    uses: 'Cardiac tonic (bark), silk production, riverbank stabilization'
  },
  {
    id: 'ficus-benghalensis',
    commonName: 'Banyan',
    scientificName: 'Ficus benghalensis',
    localName: 'Bargad (Hindi), Aalada Mara (Kannada)',
    category: 'tree',
    conservationStatus: 'LC',
    endemic: false,
    medicinal: true,
    restorationValue: 'high',
    habitat: ['Mixed forest', 'Village groves'],
    characteristics: 'Massive spreading tree with aerial roots forming secondary trunks. Leathery oval leaves. Red figs in pairs.',
    uses: 'Sacred tree, wildlife food source, shade, traditional medicine'
  },
  {
    id: 'artocarpus-heterophyllus',
    commonName: 'Jackfruit',
    scientificName: 'Artocarpus heterophyllus',
    localName: 'Kathal (Hindi), Halasu (Kannada)',
    category: 'tree',
    conservationStatus: 'LC',
    endemic: false,
    medicinal: true,
    restorationValue: 'high',
    habitat: ['Evergreen forest', 'Home gardens'],
    characteristics: 'Medium tree 8-25m. Dark green leathery leaves. Cauliflorous (fruits on trunk). Largest tree-borne fruit.',
    uses: 'Edible fruit, timber, latex, agroforestry'
  },
  {
    id: 'myristica-malabarica',
    commonName: 'Malabar Nutmeg',
    scientificName: 'Myristica malabarica',
    localName: 'Rampatri (Hindi), Panampu (Kannada)',
    category: 'tree',
    conservationStatus: 'VU',
    endemic: true,
    medicinal: true,
    restorationValue: 'high',
    habitat: ['Myristica swamp', 'Evergreen forest'],
    characteristics: 'Endemic to Western Ghats swamps. Stilt roots in swampy areas. Aromatic bark. Red aril around seed.',
    uses: 'Spice, medicinal, indicator of sacred grove health'
  },
  {
    id: 'hopea-ponga',
    commonName: 'Kambuga',
    scientificName: 'Hopea ponga',
    localName: 'Kambuga (Kannada)',
    category: 'tree',
    conservationStatus: 'EN',
    endemic: true,
    medicinal: false,
    restorationValue: 'high',
    habitat: ['Lowland evergreen', 'Sacred groves'],
    characteristics: 'Endangered endemic. Medium tree with buttresses. Leaves with parallel veins. Small fragrant flowers.',
    uses: 'Quality timber (now protected), ecosystem restoration'
  },
  {
    id: 'garcinia-indica',
    commonName: 'Kokum',
    scientificName: 'Garcinia indica',
    localName: 'Kokum (Marathi/Konkani), Murgina (Kannada)',
    category: 'tree',
    conservationStatus: 'VU',
    endemic: true,
    medicinal: true,
    restorationValue: 'high',
    habitat: ['Evergreen forest', 'Semi-evergreen'],
    characteristics: 'Small to medium tree. Dense pyramidal crown. Dark green glossy leaves. Purple fruits with acidic pulp.',
    uses: 'Culinary (sour agent), kokum butter, medicinal (digestive)'
  },
  {
    id: 'dipterocarpus-indicus',
    commonName: 'Indian Dipterocarps',
    scientificName: 'Dipterocarpus indicus',
    localName: 'Gurjan (Hindi)',
    category: 'tree',
    conservationStatus: 'CR',
    endemic: true,
    medicinal: false,
    restorationValue: 'high',
    habitat: ['Lowland evergreen'],
    characteristics: 'Critically endangered. Tall emergent tree. Large leaves. Characteristic winged fruits. Produces valuable oleoresin.',
    uses: 'Timber (protected), resin, old growth forest restoration'
  },
  {
    id: 'calamus-rotang',
    commonName: 'Rattan',
    scientificName: 'Calamus rotang',
    localName: 'Bet (Hindi), Betta (Kannada)',
    category: 'climber',
    conservationStatus: 'NT',
    endemic: false,
    medicinal: true,
    restorationValue: 'medium',
    habitat: ['Evergreen forest understory'],
    characteristics: 'Climbing palm with thorny leaf sheaths. Long flexible stems. Needs host trees for support.',
    uses: 'Cane furniture, medicinal, indicator of forest health'
  },
  {
    id: 'strobilanthes-kunthiana',
    commonName: 'Neelakurinji',
    scientificName: 'Strobilanthes kunthiana',
    localName: 'Kurinji (Tamil)',
    category: 'shrub',
    conservationStatus: 'LC',
    endemic: true,
    medicinal: false,
    restorationValue: 'medium',
    habitat: ['Shola grassland', 'High altitude'],
    characteristics: 'Flowers once in 12 years creating blue carpets on hillsides. 30-60cm shrub. Indicator of shola ecosystem.',
    uses: 'Honey production, cultural significance, eco-tourism'
  },
  {
    id: 'bambusa-bambos',
    commonName: 'Giant Thorny Bamboo',
    scientificName: 'Bambusa bambos',
    localName: 'Kanta Baans (Hindi), Bidiru (Kannada)',
    category: 'grass',
    conservationStatus: 'LC',
    endemic: false,
    medicinal: true,
    restorationValue: 'high',
    habitat: ['Moist deciduous', 'Riverine'],
    characteristics: 'Clump-forming giant bamboo, 15-30m. Thorny culms. Fast growing. Important for ecosystem restoration.',
    uses: 'Construction, paper, erosion control, carbon sequestration'
  },
  {
    id: 'caryota-urens',
    commonName: 'Fishtail Palm',
    scientificName: 'Caryota urens',
    localName: 'Bherli Mad (Marathi), Baine (Kannada)',
    category: 'palm',
    conservationStatus: 'LC',
    endemic: false,
    medicinal: false,
    restorationValue: 'medium',
    habitat: ['Semi-evergreen', 'Moist deciduous'],
    characteristics: 'Distinctive fishtail-shaped leaflets. Single-stemmed palm, 12-20m. Flowers once then dies (monocarpic).',
    uses: 'Toddy, jaggery, fiber, wildlife food'
  }
];

const categoryIcons: Record<string, string> = {
  tree: 'M12 2L4.5 20.3l.7.7L12 18l6.8 3 .7-.7L12 2z',
  shrub: 'M12 6c-2.67 0-8 1.34-8 4v10h16V10c0-2.66-5.33-4-8-4z',
  herb: 'M12 22c-4.97 0-9-4.03-9-9 0-4.17 2.77-7.69 6.57-8.74C10.22 6.33 12 8.97 12 12c0-3.03 1.78-5.67 4.43-7.74C20.23 5.31 23 8.83 23 13c0 4.97-4.03 9-9 9z',
  climber: 'M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z',
  grass: 'M12 20l-3-3h2v-4H9l3-3 3 3h-2v4h2l-3 3z',
  fern: 'M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z',
  palm: 'M12 2L9 9l3-1 3 1-3-7zm-6.35 6.96L12 12l-1.24 2.69-5.11-5.73zm12.7 0l-5.11 5.73L12 12l6.35-3.04zM12 14v8h-.01c-.01-2.48-.71-4.56-1.85-5.94L12 14zm0 0c.01 0 .01 0 0 0l1.86 2.06c-1.14 1.38-1.84 3.46-1.85 5.94H12v-8z'
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  LC: { bg: '#4caf5020', text: '#4caf50', label: 'Least Concern' },
  NT: { bg: '#8bc34a20', text: '#8bc34a', label: 'Near Threatened' },
  VU: { bg: '#ff980020', text: '#ff9800', label: 'Vulnerable' },
  EN: { bg: '#ff572220', text: '#ff5722', label: 'Endangered' },
  CR: { bg: '#f4433620', text: '#f44336', label: 'Critically Endangered' }
};

const SpeciesGuide: React.FC<SpeciesGuideProps> = ({ onClose, onRecordSpecies }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showEndemic, setShowEndemic] = useState(false);
  const [showMedicinal, setShowMedicinal] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);

  const filteredSpecies = speciesData.filter(species => {
    const matchesSearch = 
      species.commonName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      species.scientificName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (species.localName?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || species.category === selectedCategory;
    const matchesEndemic = !showEndemic || species.endemic;
    const matchesMedicinal = !showMedicinal || species.medicinal;
    
    return matchesSearch && matchesCategory && matchesEndemic && matchesMedicinal;
  });

  return (
    <div className="species-guide-panel">
      <div className="panel-header">
        <h2>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 22c-4.97 0-9-4.03-9-9 0-4.17 2.77-7.69 6.57-8.74C10.22 6.33 12 8.97 12 12c0-3.03 1.78-5.67 4.43-7.74C20.23 5.31 23 8.83 23 13c0 4.97-4.03 9-9 9z"/>
          </svg>
          Species Guide
        </h2>
        <button className="close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {!selectedSpecies ? (
        <>
          {/* Search */}
          <div className="species-search">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className="species-filters">
            <div className="category-filters">
              <button 
                className={`cat-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All
              </button>
              {['tree', 'shrub', 'climber', 'palm', 'grass'].map(cat => (
                <button
                  key={cat}
                  className={`cat-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d={categoryIcons[cat]}/>
                  </svg>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
            
            <div className="toggle-filters">
              <label className="toggle-filter">
                <input 
                  type="checkbox" 
                  checked={showEndemic}
                  onChange={(e) => setShowEndemic(e.target.checked)}
                />
                <span className="endemic-badge">Endemic Only</span>
              </label>
              <label className="toggle-filter">
                <input 
                  type="checkbox" 
                  checked={showMedicinal}
                  onChange={(e) => setShowMedicinal(e.target.checked)}
                />
                <span className="medicinal-badge">Medicinal</span>
              </label>
            </div>
          </div>

          {/* Species Count */}
          <div className="species-count">
            Showing {filteredSpecies.length} of {speciesData.length} species
          </div>

          {/* Species List */}
          <div className="species-list">
            {filteredSpecies.map(species => (
              <div 
                key={species.id}
                className="species-card"
                onClick={() => setSelectedSpecies(species)}
              >
                <div className="species-icon">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d={categoryIcons[species.category]}/>
                  </svg>
                </div>
                <div className="species-info">
                  <h3>{species.commonName}</h3>
                  <p className="scientific-name">{species.scientificName}</p>
                  <div className="species-badges">
                    {species.conservationStatus && (
                      <span 
                        className="status-badge"
                        style={{ 
                          backgroundColor: statusColors[species.conservationStatus].bg,
                          color: statusColors[species.conservationStatus].text
                        }}
                      >
                        {species.conservationStatus}
                      </span>
                    )}
                    {species.endemic && (
                      <span className="endemic-tag">Endemic</span>
                    )}
                    {species.medicinal && (
                      <span className="medicinal-tag">Medicinal</span>
                    )}
                    <span className={`restoration-tag ${species.restorationValue}`}>
                      {species.restorationValue} value
                    </span>
                  </div>
                </div>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="chevron">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Species Detail View */
        <div className="species-detail">
          <button className="back-btn" onClick={() => setSelectedSpecies(null)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Back to List
          </button>

          <div className="detail-hero">
            <div className="hero-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                <path d={categoryIcons[selectedSpecies.category]}/>
              </svg>
            </div>
            <div className="hero-info">
              <h2>{selectedSpecies.commonName}</h2>
              <p className="scientific">{selectedSpecies.scientificName}</p>
              {selectedSpecies.localName && (
                <p className="local-name">{selectedSpecies.localName}</p>
              )}
            </div>
          </div>

          <div className="detail-badges">
            {selectedSpecies.conservationStatus && (
              <div 
                className="status-card"
                style={{ 
                  backgroundColor: statusColors[selectedSpecies.conservationStatus].bg,
                  borderColor: statusColors[selectedSpecies.conservationStatus].text
                }}
              >
                <span 
                  className="status-code"
                  style={{ color: statusColors[selectedSpecies.conservationStatus].text }}
                >
                  {selectedSpecies.conservationStatus}
                </span>
                <span className="status-label">
                  {statusColors[selectedSpecies.conservationStatus].label}
                </span>
              </div>
            )}
            {selectedSpecies.endemic && (
              <div className="endemic-card">
                <span className="icon">🌿</span>
                <span>Western Ghats Endemic</span>
              </div>
            )}
            {selectedSpecies.medicinal && (
              <div className="medicinal-card">
                <span className="icon">💊</span>
                <span>Medicinal Value</span>
              </div>
            )}
          </div>

          <div className="detail-section">
            <h3>Restoration Value</h3>
            <div className={`restoration-indicator ${selectedSpecies.restorationValue}`}>
              <div className="bar">
                <div className="fill"></div>
              </div>
              <span>{selectedSpecies.restorationValue.toUpperCase()}</span>
            </div>
          </div>

          <div className="detail-section">
            <h3>Habitat</h3>
            <div className="habitat-tags">
              {selectedSpecies.habitat.map((h, i) => (
                <span key={i} className="habitat-tag">{h}</span>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <h3>Identification</h3>
            <p>{selectedSpecies.characteristics}</p>
          </div>

          {selectedSpecies.uses && (
            <div className="detail-section">
              <h3>Uses & Significance</h3>
              <p>{selectedSpecies.uses}</p>
            </div>
          )}

          <button 
            className="record-species-btn"
            onClick={() => onRecordSpecies(selectedSpecies.id)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
            Record Sighting at Current Location
          </button>
        </div>
      )}
    </div>
  );
};

export default SpeciesGuide;
