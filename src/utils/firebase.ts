import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, DocumentData, deleteDoc, orderBy, serverTimestamp, updateDoc, doc, startAt, endAt } from 'firebase/firestore';
import * as geofire from 'geofire-common';

const firebaseConfig = {
  apiKey: "AIzaSyC2JzUkl9OfZGpI8i97LgUGhbTWYya7dd0",
  authDomain: "speechfirebase-63ede.firebaseapp.com",
  projectId: "speechfirebase-63ede",
  storageBucket: "speechfirebase-63ede.firebasestorage.app",
  messagingSenderId: "380886220262",
  appId: "1:380886220262:web:baf948b8bdeccf1ecbaa27"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface Taxi {
  driverName: string;
  plateNumber: string;
  lat: number;
  lng: number;
  geohash: string;
  isAvailable: boolean;

}

export interface TaxiWithDistance extends Taxi {
  id: string;
  distance: number;
}

type GeoPoint = [number, number];

// Taksi ekleme fonksiyonu
export const addTaxi = async (taxi: Omit<Taxi, 'geohash'>) => {
  try {
    const location: GeoPoint = [taxi.lat, taxi.lng];
    const geohash = geofire.geohashForLocation(location);
    
    const docRef = await addDoc(collection(db, 'taxis'), {
      ...taxi,
      geohash,
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Taksi eklenirken hata:', error);
    throw error;
  }
};

// En yakın taksiyi bulma fonksiyonu
export const findNearestTaxi = async (lat: number, lng: number): Promise<TaxiWithDistance | null> => {
  try {
    console.log('Searching for taxi at coordinates:', { lat, lng });
    
    const center: GeoPoint = [lat, lng];
    const radiusInM = 20 * 1000; // 50 km yarıçap

    const bounds = geofire.geohashQueryBounds(center, radiusInM);
    console.log('Geohash bounds:', bounds);
    
    const promises = [];

    for (const b of bounds) {
      // Sorguyu basitleştiriyoruz
      const q = query(
        collection(db, 'taxis'),
        where('isAvailable', '==', true),
        orderBy('geohash'),
        startAt(b[0]),
        endAt(b[1])
      );
      promises.push(getDocs(q));
    }

    const snapshots = await Promise.all(promises);
    const matchingDocs: TaxiWithDistance[] = [];

    for (const snap of snapshots) {
      console.log('Found documents:', snap.size);
      for (const doc of snap.docs) {
        const taxiData = doc.data() as Taxi;
        console.log('Processing taxi:', taxiData);
        
        const taxiLocation: GeoPoint = [taxiData.lat, taxiData.lng];
        const distanceInM = geofire.distanceBetween(taxiLocation, center) * 1000;
        
        if (distanceInM <= radiusInM) {
          const taxi = {
            id: doc.id,
            ...taxiData,
            distance: distanceInM
          };
          matchingDocs.push(taxi);
        }
      }
    }

    console.log('Total matching taxis:', matchingDocs.length);

    // Mesafeye göre sırala
    matchingDocs.sort((a, b) => a.distance - b.distance);

    if (matchingDocs.length > 0) {
    const nearestTaxi = matchingDocs[0];
    console.log('Selected nearest taxi:', nearestTaxi);
    return nearestTaxi;
    }

    console.log('No available taxis found');
    return null;
  } catch (error) {
    console.error('Error in findNearestTaxi:', error);
    throw error;
  }
};

// Örnek taksileri ekleme fonksiyonu
export const seedSampleTaxis = async () => {
  // Önce koleksiyonu temizle
  const snapshot = await getDocs(collection(db, 'taxis'));
  await Promise.all(snapshot.docs.map(doc => deleteDoc(doc.ref)));
    const taxis = [
      {
      // İzmir - Bornova
      driverName: "Ahmet Yılmaz",
      plateNumber: "35 ABC 123",
      lat: 38.45684671460064,
      lng: 27.209916728202966,
      isAvailable: true
      },
      {
        // İstanbul
        driverName: "Cengiz",
        plateNumber: "35 CNG 234",
        lat: 41.0085,
        lng: 28.9789,
        isAvailable: true

      },
      {
      // İzmir - Alsancak
      driverName: "Mehmet Demir",
      plateNumber: "35 XYZ 456",
      lat: 38.43726435449817,
      lng: 27.142925657899127,
      isAvailable: true
      },
      {
      // İzmir - Karşıyaka
      driverName: "Ayşe Kaya",
      plateNumber: "35 DEF 789",
      lat: 38.46247895613027,
      lng: 27.125330725392665,
      isAvailable: true
      },
      {
      // İzmir - Konak
      driverName: "Mert Adalı",
      plateNumber: "35 MRT 789",
      lat: 38.41914583431978,
      lng: 27.128935996772827,
      isAvailable: true
      },

      {
      // İstanbul - Taksim
      driverName: "Atakan deneme",
      plateNumber: "34 ATK 788",  // İstanbul plakası yaptım
      lat: 41.0085,
      lng: 28.9789,
      isAvailable: true  // Müsait durumda
      }
    ];

  try {
    // Tüm taksileri ekle
    for (const taxi of taxis) {
      const geohash = geofire.geohashForLocation([taxi.lat, taxi.lng]);
      await addDoc(collection(db, 'taxis'), {
        ...taxi,
        geohash,
        createdAt: serverTimestamp()
      });
    }

    console.log('Taksiler başarıyla eklendi');
    return true;
  } catch (error) {
    console.error('Taksi ekleme hatası:', error);
    throw error;
  }
};

// Taksi durumunu güncelleme fonksiyonu
export const updateTaxiAvailability = async (taxiId: string, isAvailable: boolean) => {
  try {
    const taxiRef = doc(db, 'taxis', taxiId);
    await updateDoc(taxiRef, { isAvailable });
    return true;
  } catch (error) {
    console.error('Taksi durumu güncellenirken hata:', error);
    throw error;
  }
};
