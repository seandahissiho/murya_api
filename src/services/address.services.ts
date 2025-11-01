import {prisma} from "../config/db";

export const createAddress = async (data: any) => {
    // generate the reference for the address using the street and city
    const reference = `ADDR-${data?.street}-${data?.city}`.toUpperCase();
    // check if the address with the same reference already exists
    const existingAddress = await prisma.address.findUnique({
        where: { ref: reference }
    });
    if (existingAddress) {
        // if the address already exists, return it
        return existingAddress;
    }

    if (!data.street) {
        throw new Error("La rue est obligatoire pour créer une adresse");
    }
    if (!data.city) {
        throw new Error("La ville est obligatoire pour créer une adresse");
    }

    if (!data.country) {
        throw new Error("Le pays est obligatoire pour créer une adresse");
    }

    const country = await createCountry(data.country);
    data.countryId = country.isoCode; // set the countryId to the newly created country
    // remove country from data to avoid duplication
    delete data.country;

    // if address is provided, create a new address if it's reference is not already in use
    const address = await prisma.address.create({
        data: {
            ...data,
            ref: reference
        }
    });
    if (!address) {
        throw new Error("Erreur lors de la création de l'adresse");
    }
    return address;
}

export const createCountry = async (data: any) => {
    // check if the country with the code name already exists
    const existingCountry = await prisma.country.findUnique({
        where: { isoCode: data.isoCode }
    });
    if (existingCountry) {
        // if the country already exists, return it
        return existingCountry;
    }
    // if country is provided, create a new country if it's reference is not already in use
    const country = await prisma.country.create({
        data: {
            ...data,
        }
    });
    if (!country) {
        throw new Error("Erreur lors de la création du pays");
    }
    return country;
}