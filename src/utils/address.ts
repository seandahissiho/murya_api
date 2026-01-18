type AddressForMaps = {
    street?: string | null;
    zip?: string | null;
    city?: string | null;
    countryId?: string | null;
    googleMapsUrl?: string | null;
};

export const buildGoogleMapsUrl = (address?: AddressForMaps | null) => {
    if (!address) {
        return null;
    }
    if (address.googleMapsUrl) {
        return address.googleMapsUrl;
    }

    const parts = [address.street, address.zip, address.city, address.countryId]
        .filter((value): value is string => Boolean(value && value.trim().length > 0))
        .join(" ");

    if (!parts) {
        return null;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
};
