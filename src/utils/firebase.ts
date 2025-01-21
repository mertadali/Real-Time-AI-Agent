import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, DocumentData, deleteDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Check if all required environment variables are set
if (!process.env.REACT_APP_FIREBASE_API_KEY || 
    !process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 
    !process.env.REACT_APP_FIREBASE_PROJECT_ID) {
  throw new Error('Missing required Firebase configuration. Please check your .env file.');
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Product interface
export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
}

// Clean up duplicate products
export async function cleanupDuplicateProducts(): Promise<void> {
  try {
    const productsRef = collection(db, 'products');
    const querySnapshot = await getDocs(productsRef);
    
    // Create a map to store unique products by name
    const uniqueProducts = new Map<string, {doc: DocumentData, id: string}>();
    
    // Iterate through all products
    querySnapshot.docs.forEach(doc => {
      const data = doc.data();
      const name = data.name.toLowerCase();
      
      if (!uniqueProducts.has(name)) {
        // If this is the first instance of the product, save it
        uniqueProducts.set(name, {doc: data, id: doc.id});
      } else {
        // If this is a duplicate, delete it
        deleteDoc(doc.ref);
      }
    });
    
    console.log(`Cleaned up ${querySnapshot.size - uniqueProducts.size} duplicate products`);
  } catch (error) {
    console.error('Error cleaning up duplicates:', error);
  }
}

// Check if product exists
async function productExists(name: string): Promise<boolean> {
  const productsRef = collection(db, 'products');
  const q = query(productsRef, where("name", "==", name.toLowerCase()));
  const querySnapshot = await getDocs(q);
  return !querySnapshot.empty;
}

// Add a new product (with duplicate check)
export async function addProduct(product: Omit<Product, 'id'>): Promise<string | null> {
  try {
    // Check if product already exists
    const exists = await productExists(product.name);
    if (exists) {
      console.log(`Product "${product.name}" already exists`);
      return null;
    }

    // If product doesn't exist, add it
    const productsRef = collection(db, 'products');
    const docRef = await addDoc(productsRef, {
      ...product,
      name: product.name.toLowerCase(), // Store names in lowercase for easier searching
      category: product.category.toLowerCase() // Store categories in lowercase for consistency
    });
    console.log(`Added new product "${product.name}" with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error adding product:', error);
    return null;
  }
}

// Get product by name (case insensitive)
export async function getProductByName(name: string): Promise<Product | null> {
  try {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, where("name", "==", name.toLowerCase()));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Product;
  } catch (error) {
    console.error('Error getting product:', error);
    return null;
  }
}

// Get product by category
export async function getProductsByCategory(category: string): Promise<Product[]> {
  try {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, where("category", "==", category.toLowerCase()));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Product);
  } catch (error) {
    console.error('Error getting products by category:', error);
    return [];
  }
}

// Get all products
export async function getAllProducts(): Promise<Product[]> {
  try {
    const productsRef = collection(db, 'products');
    const querySnapshot = await getDocs(productsRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Product);
  } catch (error) {
    console.error('Error getting all products:', error);
    return [];
  }
}

await addProduct({
    name: "Laptop Pro X",
    price: 500.99,
    stock: 25,
    category: "electronics"
  });

  await addProduct({
    name: "Laptop Pro 1",
    price: 1299.99,
    stock: 35,
    category: "electronics"
  });

  await addProduct({
    name: "Laptop Pro 2",
    price: 700.99,
    stock: 45,
    category: "electronics"
  });

  await addProduct({
    name: "Laptop Pro 3",
    price: 800.99,
    stock: 55,
    category: "electronics"
  });