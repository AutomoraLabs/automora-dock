using System;
using System.IO;
internal static class FolderFavoritesTest
{
    static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
    static void Main(string[] args){
        string directory=args[0],folder=Path.Combine(directory,"My favourite folder");Directory.CreateDirectory(folder);
        string file=Path.Combine(directory,"favorites.json");var store=new FolderFavorites(file);
        Check(store.Read().Count==0,"Initial list");
        var added=store.Add(folder);Check(added.Count==1,"Add");string id=added[0].id;
        Check(store.Add(folder+Path.DirectorySeparatorChar).Count==1,"Duplicate path");
        var reopened=new FolderFavorites(file);Check(reopened.Read()[0].id==id,"Persistence");Check(reopened.Resolve(id)==folder,"Resolve");
        store.Rename(id,"My custom label");Check(new FolderFavorites(file).Read()[0].name=="My custom label","Custom label persists");Check(store.Resolve(id)==folder && Directory.Exists(folder),"Rename must not touch the actual folder");
        store.SetColor(id,"sage");Check(new FolderFavorites(file).Read()[0].color=="sage","Color persists");
        string second=Path.Combine(directory,"Second folder");Directory.CreateDirectory(second);var two=store.Add(second);string secondId=two[1].id;
        store.Reorder(new System.Collections.Generic.List<string>{secondId,id});Check(new FolderFavorites(file).Read()[0].id==secondId,"Order persists");
        string before=File.ReadAllText(file);
        try{store.Reorder(new System.Collections.Generic.List<string>{id,id});throw new Exception("Duplicate reorder accepted");}catch(ArgumentException){}
        Check(File.ReadAllText(file)==before,"Invalid reorder must not mutate data");
        try{store.SetColor(id,"invalid");throw new Exception("Invalid color accepted");}catch(ArgumentException){}
        try{store.Rename(id," ");throw new Exception("Empty name accepted");}catch(ArgumentException){}
        store.Remove(secondId);Check(store.Read()[0].id==id && store.Read()[0].color=="sage","Removing another shortcut preserves edits");
        string legacy=Path.Combine(directory,"legacy.json");File.WriteAllText(legacy,new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new[]{new{id="legacy",name="Legacy",path=folder}}));Check(new FolderFavorites(legacy).Read()[0].color=="amber","Legacy color migration");
        Check(store.Remove(id).Count==0,"Remove");Check(Directory.Exists(folder),"Removal must preserve the real folder");
        Check(File.Exists(file+".bak"),"Previous state backup");
        id=store.Add(folder)[0].id;Directory.Delete(folder);
        Check(store.PathFor(id)==folder,"Saved folder address remains available for copying when offline");
        try{store.Resolve(id);throw new Exception("Missing folder accepted");}catch(DirectoryNotFoundException){}
        Check(store.Remove(id).Count==0,"Unavailable folder can still be removed");
        File.WriteAllText(file,"{broken");try{store.Add(directory);throw new Exception("Corrupt file silently replaced");}catch(ArgumentException){}
        Check(File.ReadAllText(file)=="{broken","Preserve corrupt file for recovery");
        Console.WriteLine("PASS: add, deduplicate, persist, resolve, remove, backup, missing folder, corrupt file protection.");
    }
}
