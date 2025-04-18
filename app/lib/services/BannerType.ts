function isEUCountry(country :string) {
    const euCountries = [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 
        'DE', 'GR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 
        'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    ];
    return euCountries.includes(country); 
  }

  export default function selectBannerTemplate(country: string) {
    console.log('Selecting banner for:', country);

    if (isEUCountry(country)) {
        return 'GDPR';
    }

    if (country === 'US') {
        return 'CCPA';
    }

    return 'GDPR';
}
