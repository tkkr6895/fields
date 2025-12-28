import React, { useState } from 'react';

interface Protocol {
  id: string;
  title: string;
  category: 'observation' | 'measurement' | 'sampling' | 'documentation';
  difficulty: 'basic' | 'intermediate' | 'advanced';
  estimatedTime: string;
  description: string;
  steps: string[];
  equipment: string[];
  dataFields: string[];
}

interface AppGuideSection {
  id: string;
  title: string;
  icon: string;
  content: {
    heading: string;
    steps?: string[];
    tips?: string[];
    note?: string;
  }[];
}

interface FieldProtocolsProps {
  onClose: () => void;
  onStartProtocol: (protocolId: string) => void;
}

// App usage guide sections
const appGuideSections: AppGuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '🚀',
    content: [
      {
        heading: 'First Launch',
        steps: [
          'Grant location permissions when prompted for GPS tracking',
          'The app works offline - data syncs automatically when connected',
          'Your position is shown as a blue dot on the map'
        ],
        tips: ['Enable high-accuracy GPS in your device settings for best results']
      }
    ]
  },
  {
    id: 'navigation',
    title: 'Navigation',
    icon: '🧭',
    content: [
      {
        heading: 'Bottom Navigation Bar',
        steps: [
          '🗺️ Map - Main map view with all layers and controls',
          '📚 Layers - Toggle map layers on/off by category',
          '📋 Guide - Field protocols and this app guide',
          '📝 Log - View, export, and sync your field observations'
        ]
      },
      {
        heading: 'Map Controls (Right Side)',
        steps: [
          '+ / − Zoom in and out',
          '📍 Center map on your current GPS location',
          '🔄 Reset view to Western Ghats boundary',
          '🛰️/🌙 Toggle between satellite and dark basemap'
        ]
      }
    ]
  },
  {
    id: 'layers',
    title: 'Using Layers',
    icon: '🗂️',
    content: [
      {
        heading: 'Layer Panel Features',
        steps: [
          'Tap the Layers tab to open the layer panel',
          'Browse by Category: Forest, LULC, Built Area, etc.',
          'Browse by Timeline: View layers by year (2015-2025)',
          'Browse All: See complete list of 25+ layers',
          'Use search to quickly find specific layers'
        ],
        tips: [
          'Enable/disable entire categories with one tap',
          'Layer legend shows what each color means',
          'Multiple layers can be active simultaneously'
        ]
      },
      {
        heading: 'Available Layer Categories',
        steps: [
          '🌲 Forest - Forest type classification, tree cover density',
          '🗺️ LULC - Land use/land cover maps by year',
          '🏗️ Built Area - Urban and settlement extent',
          '🌿 Plantations - Coffee, rubber, and other plantations',
          '📍 Boundaries - Western Ghats boundary, districts'
        ]
      }
    ]
  },
  {
    id: 'capturing',
    title: 'Capturing Observations',
    icon: '📸',
    content: [
      {
        heading: 'Creating a New Observation',
        steps: [
          'Tap the + button in the center of the bottom navigation',
          'Your GPS location is automatically captured',
          'Select the observation type (Land Cover, Forest, etc.)',
          'Choose validation status if ground-truthing',
          'Add photos by tapping the camera icon',
          'Write detailed notes about what you observe',
          'Tap Save to store the observation locally'
        ],
        tips: [
          'Observations are saved offline and sync when online',
          'Take photos in all 4 cardinal directions for context',
          'Include specific species names when possible'
        ]
      }
    ]
  },
  {
    id: 'location-info',
    title: 'Location Information',
    icon: '📍',
    content: [
      {
        heading: 'Getting Details for Any Location',
        steps: [
          'Tap anywhere on the map to see location details',
          'Or use the search bar to find a specific place',
          'The Location Info panel shows weather, elevation, etc.',
          'View Dynamic World land cover classification',
          'Check CoreStack environmental data if available'
        ],
        note: 'Some data requires internet connection to fetch'
      }
    ]
  },
  {
    id: 'field-log',
    title: 'Managing Your Field Log',
    icon: '📝',
    content: [
      {
        heading: 'Viewing and Exporting Observations',
        steps: [
          'Tap the Log tab to see all your observations',
          'Filter by validation status using the dropdown',
          'Tap any observation to view details or navigate to it',
          'Use Export GeoJSON for GIS-compatible format',
          'Use Export CSV for spreadsheet format',
          'Tap Sync to pull additional data from services'
        ],
        tips: [
          'Sync enriches observations with weather, land cover data',
          'Export regularly as backup of your field work',
          'GeoJSON can be imported into QGIS, ArcGIS, etc.'
        ]
      }
    ]
  },
  {
    id: 'offline',
    title: 'Offline Mode',
    icon: '📴',
    content: [
      {
        heading: 'Working Without Internet',
        steps: [
          'All observations are saved locally on your device',
          'Map tiles are cached as you browse',
          'Raster layers (LULC, Forest) work fully offline',
          'When back online, tap Sync to fetch external data',
          'The header shows online/offline status'
        ],
        tips: [
          'Pre-load map areas before going to remote locations',
          'Enable all layers once to cache their imagery'
        ]
      }
    ]
  }
];

const protocols: Protocol[] = [
  {
    id: 'tree-survey',
    title: 'Tree Inventory Survey',
    category: 'measurement',
    difficulty: 'intermediate',
    estimatedTime: '15-30 min per plot',
    description: 'Systematic documentation of tree species, DBH, height, and health status within a defined plot.',
    steps: [
      'Define a 10m x 10m plot or use GPS to mark boundaries',
      'Identify all trees with DBH ≥ 10cm',
      'Measure DBH at 1.3m height using tape',
      'Estimate tree height using clinometer or visual estimation',
      'Record species name (local or scientific)',
      'Assess tree health (healthy, stressed, dead)',
      'Note any signs of disease, damage, or regeneration',
      'Take photos of notable specimens'
    ],
    equipment: ['Measuring tape', 'DBH tape', 'Clinometer (optional)', 'GPS device', 'Field notebook'],
    dataFields: ['Species', 'DBH (cm)', 'Height (m)', 'Health Status', 'Crown Condition', 'Notes']
  },
  {
    id: 'land-cover-validation',
    title: 'Land Cover Ground Truth',
    category: 'observation',
    difficulty: 'basic',
    estimatedTime: '5-10 min per point',
    description: 'Validate satellite-derived land cover classifications with actual ground conditions.',
    steps: [
      'Navigate to the target coordinates',
      'Stand at the exact location or as close as possible',
      'Observe land cover in a 30m radius (Landsat pixel size)',
      'Identify the dominant land cover type',
      'Estimate percentage cover of each class present',
      'Note any recent changes (fire, clearing, construction)',
      'Take photos in 4 cardinal directions',
      'Record confidence level of observation'
    ],
    equipment: ['GPS device', 'Camera', 'Compass', 'Field notebook'],
    dataFields: ['Primary Land Cover', 'Secondary Cover', 'Cover %', 'Recent Change', 'Confidence']
  },
  {
    id: 'water-body-assessment',
    title: 'Water Body Assessment',
    category: 'measurement',
    difficulty: 'intermediate',
    estimatedTime: '20-45 min per site',
    description: 'Comprehensive assessment of water bodies including physical, chemical, and biological indicators.',
    steps: [
      'Document water body type (stream, pond, tank, etc.)',
      'Measure approximate dimensions (length, width, depth)',
      'Assess water clarity and color',
      'Check for visible pollution or algal blooms',
      'Note surrounding land use and vegetation',
      'Document inflow and outflow points',
      'Identify any aquatic vegetation or wildlife',
      'Take water sample if testing equipment available'
    ],
    equipment: ['Measuring tape', 'Depth stick', 'Water testing kit (optional)', 'GPS', 'Camera'],
    dataFields: ['Water Body Type', 'Dimensions', 'Clarity', 'Pollution Signs', 'Biodiversity Notes']
  },
  {
    id: 'restoration-monitoring',
    title: 'Restoration Site Monitoring',
    category: 'documentation',
    difficulty: 'advanced',
    estimatedTime: '30-60 min per site',
    description: 'Track progress of eco-restoration sites including survival rates, growth, and natural regeneration.',
    steps: [
      'Locate and verify restoration plot boundaries',
      'Count surviving planted trees vs. original count',
      'Measure sample of trees for height and canopy spread',
      'Document natural regeneration (species, count)',
      'Assess ground cover and grass establishment',
      'Check soil moisture and erosion control structures',
      'Note pest/disease issues if any',
      'Compare with previous monitoring data',
      'Photograph fixed photo points'
    ],
    equipment: ['GPS', 'Measuring tape', 'Height pole', 'Previous monitoring data', 'Camera'],
    dataFields: ['Survival Rate', 'Avg Height', 'Canopy Cover', 'Natural Regeneration', 'Soil Condition']
  },
  {
    id: 'biodiversity-quick',
    title: 'Quick Biodiversity Survey',
    category: 'observation',
    difficulty: 'basic',
    estimatedTime: '15-20 min per location',
    description: 'Rapid assessment of visible biodiversity including birds, butterflies, and notable plant species.',
    steps: [
      'Remain stationary and quiet for 5 minutes',
      'Record all bird species seen or heard',
      'Note butterfly and other insect activity',
      'Document any mammals or reptiles observed',
      'Identify notable flowering plants',
      'Record fruiting/flowering phenology',
      'Note signs of wildlife (tracks, droppings, nests)',
      'Assess overall habitat quality'
    ],
    equipment: ['Binoculars', 'Field guide (optional)', 'Camera', 'Field notebook'],
    dataFields: ['Bird Species', 'Butterfly Count', 'Other Wildlife', 'Notable Plants', 'Habitat Quality']
  },
  {
    id: 'erosion-assessment',
    title: 'Soil Erosion Assessment',
    category: 'measurement',
    difficulty: 'intermediate',
    estimatedTime: '15-25 min per site',
    description: 'Evaluate soil erosion severity and effectiveness of conservation measures.',
    steps: [
      'Identify erosion type (sheet, rill, gully)',
      'Measure gully dimensions if present',
      'Estimate erosion severity (mild, moderate, severe)',
      'Document slope angle and aspect',
      'Assess vegetation cover percentage',
      'Note existing conservation structures',
      'Check effectiveness of bunds/trenches',
      'Recommend additional measures if needed'
    ],
    equipment: ['Measuring tape', 'Clinometer', 'GPS', 'Camera'],
    dataFields: ['Erosion Type', 'Severity', 'Slope', 'Veg Cover %', 'Conservation Structures']
  }
];

const categoryColors: Record<string, string> = {
  observation: '#4a9eff',
  measurement: '#4caf50',
  sampling: '#ff9800',
  documentation: '#9c27b0'
};

const difficultyColors: Record<string, string> = {
  basic: '#4caf50',
  intermediate: '#ff9800',
  advanced: '#f44336'
};

const FieldProtocols: React.FC<FieldProtocolsProps> = ({ onClose, onStartProtocol }) => {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [activeView, setActiveView] = useState<'guide' | 'protocols'>('guide');
  const [expandedGuideSection, setExpandedGuideSection] = useState<string | null>('getting-started');

  const filteredProtocols = filterCategory === 'all' 
    ? protocols 
    : protocols.filter(p => p.category === filterCategory);

  const renderAppGuide = () => (
    <div className="app-guide-content">
      <div className="guide-intro">
        <p>Welcome to the Western Ghats Field Validator! This guide will help you use all features of the app effectively.</p>
      </div>
      
      <div className="guide-sections">
        {appGuideSections.map(section => (
          <div key={section.id} className="guide-section-card">
            <button 
              className={`guide-section-header ${expandedGuideSection === section.id ? 'expanded' : ''}`}
              onClick={() => setExpandedGuideSection(
                expandedGuideSection === section.id ? null : section.id
              )}
            >
              <span className="guide-section-icon">{section.icon}</span>
              <span className="guide-section-title">{section.title}</span>
              <svg 
                className={`guide-chevron ${expandedGuideSection === section.id ? 'open' : ''}`}
                viewBox="0 0 24 24" 
                width="20" 
                height="20" 
                fill="currentColor"
              >
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
              </svg>
            </button>
            
            {expandedGuideSection === section.id && (
              <div className="guide-section-content">
                {section.content.map((block, idx) => (
                  <div key={idx} className="guide-content-block">
                    <h4>{block.heading}</h4>
                    {block.steps && (
                      <ul className="guide-steps">
                        {block.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    )}
                    {block.tips && (
                      <div className="guide-tips">
                        <span className="tips-label">💡 Tips:</span>
                        <ul>
                          {block.tips.map((tip, i) => (
                            <li key={i}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {block.note && (
                      <div className="guide-note">
                        <span>ℹ️ {block.note}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="field-protocols-panel">
      <div className="panel-header">
        <h2>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
          {activeView === 'guide' ? 'App Guide' : 'Field Protocols'}
        </h2>
        <button className="close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* View Tabs */}
      <div className="protocols-view-tabs">
        <button 
          className={`view-tab ${activeView === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveView('guide')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          How to Use
        </button>
        <button 
          className={`view-tab ${activeView === 'protocols' ? 'active' : ''}`}
          onClick={() => { setActiveView('protocols'); setSelectedProtocol(null); }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
          Field Protocols
        </button>
      </div>

      {activeView === 'guide' ? (
        renderAppGuide()
      ) : !selectedProtocol ? (
        <>
          {/* Category Filter */}
          <div className="protocol-filters">
            <button 
              className={`filter-chip ${filterCategory === 'all' ? 'active' : ''}`}
              onClick={() => setFilterCategory('all')}
            >
              All
            </button>
            <button 
              className={`filter-chip ${filterCategory === 'observation' ? 'active' : ''}`}
              onClick={() => setFilterCategory('observation')}
              style={{ '--chip-color': categoryColors.observation } as React.CSSProperties}
            >
              Observation
            </button>
            <button 
              className={`filter-chip ${filterCategory === 'measurement' ? 'active' : ''}`}
              onClick={() => setFilterCategory('measurement')}
              style={{ '--chip-color': categoryColors.measurement } as React.CSSProperties}
            >
              Measurement
            </button>
            <button 
              className={`filter-chip ${filterCategory === 'documentation' ? 'active' : ''}`}
              onClick={() => setFilterCategory('documentation')}
              style={{ '--chip-color': categoryColors.documentation } as React.CSSProperties}
            >
              Documentation
            </button>
          </div>

          {/* Protocol List */}
          <div className="protocol-list">
            {filteredProtocols.map(protocol => (
              <div 
                key={protocol.id}
                className="protocol-card"
                onClick={() => setSelectedProtocol(protocol)}
              >
                <div className="protocol-header">
                  <span 
                    className="category-badge"
                    style={{ backgroundColor: categoryColors[protocol.category] }}
                  >
                    {protocol.category}
                  </span>
                  <span 
                    className="difficulty-badge"
                    style={{ backgroundColor: difficultyColors[protocol.difficulty] }}
                  >
                    {protocol.difficulty}
                  </span>
                </div>
                <h3>{protocol.title}</h3>
                <p>{protocol.description}</p>
                <div className="protocol-meta">
                  <span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                    </svg>
                    {protocol.estimatedTime}
                  </span>
                  <span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                    </svg>
                    {protocol.steps.length} steps
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Protocol Detail View */
        <div className="protocol-detail">
          <button className="back-btn" onClick={() => setSelectedProtocol(null)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Back to Protocols
          </button>

          <div className="detail-header">
            <div className="badges">
              <span 
                className="category-badge"
                style={{ backgroundColor: categoryColors[selectedProtocol.category] }}
              >
                {selectedProtocol.category}
              </span>
              <span 
                className="difficulty-badge"
                style={{ backgroundColor: difficultyColors[selectedProtocol.difficulty] }}
              >
                {selectedProtocol.difficulty}
              </span>
            </div>
            <h2>{selectedProtocol.title}</h2>
            <p className="time-estimate">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
              {selectedProtocol.estimatedTime}
            </p>
            <p className="description">{selectedProtocol.description}</p>
          </div>

          <div className="detail-section">
            <h3>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zm-2.21 5.04c.13.57.21 1.17.21 1.78 0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8c1.58 0 3.04.46 4.28 1.25l1.44-1.44C16.1 2.67 14.13 2 12 2 6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-1.19-.22-2.33-.6-3.39l-1.61 1.61z"/>
              </svg>
              Procedure ({selectedProtocol.steps.length} steps)
            </h3>
            <ol className="steps-list">
              {selectedProtocol.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="detail-section">
            <h3>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
              </svg>
              Equipment Needed
            </h3>
            <ul className="equipment-list">
              {selectedProtocol.equipment.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="detail-section">
            <h3>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              Data Fields to Record
            </h3>
            <div className="data-fields">
              {selectedProtocol.dataFields.map((field, index) => (
                <span key={index} className="field-tag">{field}</span>
              ))}
            </div>
          </div>

          <button 
            className="start-protocol-btn"
            onClick={() => onStartProtocol(selectedProtocol.id)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Start This Protocol
          </button>
        </div>
      )}
    </div>
  );
};

export default FieldProtocols;
